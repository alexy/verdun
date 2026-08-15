# Sendmail SMTP for Verdun applications

This runbook describes a reusable Debian Sendmail deployment for a Verdun app
whose mail domain is `example.com`. Replace every example hostname, address,
public IP, secret path, and selector with values belonging to the application.
Never copy private keys or passwords from another deployment.

The recommended topology is:

```text
Vercel application
  -> STARTTLS and SMTP AUTH at mail.example.com:587
  -> Sendmail
  -> OpenDKIM signs d=example.com
  -> recipient MX

Reply from a recipient
  -> example.com MX
  -> Sendmail on TCP 25
  -> explicit virtual recipient
  -> monitored support mailbox
```

Use one application SMTP credential with several authorized application-owned
sender addresses. The app selects the sender by message purpose, for example:

```text
account verification and onboarding -> onboarding@example.com
support and transactional notices   -> support@example.com
```

## Required DNS

Publish records equivalent to the following. The DKIM `p=` value must be
derived from this deployment's OpenDKIM private key.

```dns
example.com.                    MX  10 mail.example.com.
mail.example.com.               A   192.0.2.10
example.com.                    TXT "v=spf1 ip4:192.0.2.10 -all"
mail2026._domainkey.example.com TXT "v=DKIM1; h=sha256; k=rsa; p=..."
_dmarc.example.com.             TXT "v=DMARC1; p=none; rua=mailto:dmarc@example.com; adkim=s; aspf=s"
```

The public IP should have matching forward and reverse DNS:

```text
mail.example.com -> 192.0.2.10
192.0.2.10 -> mail.example.com
```

Start DMARC in monitoring mode. Review reports and successful alignment before
raising the policy to `quarantine` or `reject`.

For inbound transport policy, also publish:

```dns
mta-sts.example.com.      A   192.0.2.10
_mta-sts.example.com.     TXT "v=STSv1; id=2026081501"
_smtp._tls.example.com.   TXT "v=TLSRPTv1; rua=mailto:tlsrpt@example.com"
```

Serve `https://mta-sts.example.com/.well-known/mta-sts.txt` with a publicly
trusted certificate and begin with `mode: testing`. Change the TXT `id` after
every policy change.

## Sendmail submission service

Run the public MTA on TCP 25 and a submission daemon on TCP 587. Port 25 is for
server-to-server delivery. Port 587 must require SMTP authentication and
STARTTLS. A typical Sendmail configuration includes:

```m4
define(`confDOMAIN_NAME', `mail.example.com')dnl
TRUST_AUTH_MECH(`LOGIN PLAIN')dnl
define(`confAUTH_MECHANISMS', `LOGIN PLAIN')dnl
define(`confAUTH_OPTIONS', `A p y')dnl
DAEMON_OPTIONS(`Port=submission, Name=MSA, M=Ea')dnl
```

Use certificate paths owned by the deployment and rebuild generated files
after changing `/etc/mail/sendmail.mc`:

```sh
sudo make -C /etc/mail
sudo systemctl restart sendmail
```

The Cyrus SASL policy may use `sasldb` with LOGIN/PLAIN inside TLS:

```text
pwcheck_method: auxprop
auxprop_plugin: sasldb
allowanonymouslogin: 0
allowplaintext: 1
```

Create a dedicated application identity, store its random password in a
root-readable secret file, and pass the exact identity reported by
`sasldblistusers2` to Vercel. SASL realms are part of the login name; do not
assume a short username will select the intended realm.

```sh
sudo saslpasswd2 -c -u mail-host.example.net example-vercel
sudo sasldblistusers2
sudo chown root:sasl /etc/sasldb2
sudo chmod 0640 /etc/sasldb2
```

Keep old realm identities only while clients still need them. Restrict the
application credential to the application's approved envelope senders when
the local Sendmail policy supports per-authenticated-user sender rules.

## DKIM signing

Configure OpenDKIM to sign every approved address in the app domain with one
application selector:

```text
# SigningTable
*@example.com mail2026._domainkey.example.com

# KeyTable
mail2026._domainkey.example.com example.com:mail2026:/etc/opendkim/keys/example.com/mail2026.private
```

Protect the private key, connect OpenDKIM to Sendmail as a required milter, and
verify the public record before sending production traffic:

```sh
sudo opendkim-testkey -x /etc/opendkim.conf -d example.com -s mail2026 -vv
```

## Inbound replies

List the domain in `/etc/mail/local-host-names` and accept only explicit
recipients in `/etc/mail/virtusertable`:

```text
onboarding@example.com  monitored-mailbox@example.net
support@example.com     monitored-mailbox@example.net
postmaster@example.com  monitored-mailbox@example.net
abuse@example.com       monitored-mailbox@example.net
dmarc@example.com       monitored-mailbox@example.net
tlsrpt@example.com      monitored-mailbox@example.net
@example.com            error:nouser No such user
```

Rejecting unknown recipients during SMTP avoids catch-all abuse and
backscatter. Forwarding can expose the original sender's authentication to the
destination mailbox; deploy SRS or ARC when the receiving provider requires it.

## Verdun and Vercel configuration

Verdun's SMTP provider uses explicit STARTTLS by default. Configure server-only
Vercel environment variables for Production and any Preview environment that
must send real mail:

```text
EMAIL_PROVIDER=smtp
SMTP_HOST=mail.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_USER=example-vercel@mail-host.example.net
SMTP_PASSWORD=<secret>
EMAIL_FROM_ONBOARDING=Example Onboarding <onboarding@example.com>
EMAIL_FROM_SUPPORT=Example Support <support@example.com>
```

Do not prefix credentials with `VITE_` or `NEXT_PUBLIC_`. `SMTP_SECURE=false`
means connect normally and upgrade with STARTTLS; it does not permit plaintext
delivery when `SMTP_REQUIRE_TLS=true`.

An app chooses the sender without creating another transport:

```ts
import { getEmailSender } from '@querygraph/verdun/email'

const onboarding = getEmailSender({
  from: process.env.EMAIL_FROM_ONBOARDING,
})
const support = getEmailSender({
  from: process.env.EMAIL_FROM_SUPPORT,
})
```

Set both addresses to authenticated identities in the application domain.
Nodemailer uses the selected `from` value for the visible From header and SMTP
envelope sender, allowing SPF/DKIM/DMARC alignment.

## Firewall and TLS

Allow public inbound TCP 25. Vercel egress addresses are not normally stable,
so TCP 587 generally cannot be restricted to a fixed Vercel IP range; expose
it publicly and rely on TLS, strong SMTP credentials, relay restrictions, rate
limits, and monitoring. Never permit unauthenticated relaying.

Use a publicly trusted certificate containing `mail.example.com`, automate
renewal, and restart or reload Sendmail from the certificate deploy hook.

## Verification

Check services, listeners, DNS, and routing:

```sh
sudo systemctl status sendmail opendkim
sudo ss -lntp | grep -E ':(25|587)\b'
dig +short MX example.com
dig +short TXT example.com
dig +short TXT mail2026._domainkey.example.com
dig +short TXT _dmarc.example.com
sudo sendmail -Am -bv onboarding@example.com
sudo sendmail -Am -bv support@example.com
sudo mailq
```

Run the final test from the deployed Vercel function, not only from a laptop or
the mail host. Send one message with each configured sender to a mailbox where
full headers are available. Confirm:

```text
SPF: PASS
DKIM: PASS (d=example.com, s=mail2026)
DMARC: PASS
```

Reply to both messages and confirm the explicit inbound mappings deliver them
to the monitored mailbox. Review Sendmail and OpenDKIM logs for the authenticated
submission ID, DKIM signature, remote acceptance, deferrals, or bounces.

## Security and rollback

- Never commit SMTP passwords, SASL databases, or DKIM/TLS private keys.
- Rotate the application credential immediately after disclosure.
- Keep STARTTLS and authentication mandatory on port 587.
- Keep direct outbound delivery free of an unintended `SMART_HOST`.
- Back up Sendmail, SASL, OpenDKIM, TLS, and virtual-recipient configuration
  before changes; restore only after comparing the active files.
- Monitor authentication failures, queues, reputation errors, and forwarding
  loops.
