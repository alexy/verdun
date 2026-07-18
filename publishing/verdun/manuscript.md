---
title: Verdun
subtitle: "A Framework for Shared Work"
author: Alexy Khrabrov
---

> The name is an allusion, not an analogy. Verdun borrows the image of a
> defended line because shared systems need durable boundaries; it rejects the
> battle's cruelty. The purpose of this framework is coordination.

# Introduction: The Line That Holds

Most software has no trouble becoming a screen. The harder problem is remaining
coherent when many people, applications, identities, data sources, and release
paths meet at that screen. A workspace that looks simple can conceal a difficult
agreement: what belongs to the shared core, what belongs to an application, who
may act, where facts came from, and how an operator can tell whether the system
is alive.

Verdun is a flexible front-end framework for that agreement. It supplies a
reusable workbench, a unified account layer, a generic database shape, a Rust
collection runtime, and deployment checks. It is designed to be extended by
application packages without making the core become a warehouse of product
logic. Its practical shape is Vue and Vite in the browser, Vercel at the edge,
Neon-backed Postgres for persistence, and Rust engines that collect and export
the records a workbench needs.

The useful metaphor is not command. It is a field map. A map is valuable because
several people can orient themselves from it without pretending that they are
the same person. Verdun makes that orientation explicit: instances, records,
source runs, collection plans, review state, focus notes, accounts, and plans
all receive names and boundaries.

# The Workspace Is a Contract

A workspace is not merely a dashboard with filters. It is a promise that a
shared collection can be seen, reviewed, focused, and acted on without every
consumer reinventing the same machinery. Verdun keeps the generic contract in
`src/core/workbench.ts`, the shared view-model logic in
`src/composables/useWorkbenchView.ts`, and reusable controls under
`src/components/workbench/`.

This division matters. A domain application may have its own nouns, but it does
not need its own interpretation of a source run, a review decision, an empty
state, or a focus request. The application declares an instance and supplies
its domain adapter. The core supplies the mechanics that let multiple users
meet the same evidence with a common vocabulary.

The bundled `demo` instance is intentionally neutral. It proves the contract
without becoming a sample product that quietly dictates every later product's
behavior. That restraint is a feature. A framework is most reusable where it
does not smuggle in the assumptions of its first customer.

### A working boundary

Verdun owns the generic workbench types and routes, browser controls and view
models, database migrations and guarded reload helpers, deploy-profile
discovery, the crawler SDK/runtime, and the neutral proof instance. An external
application owns product routes, domain APIs, crawler adapters, compatibility
tables, product publishing, and its own Vercel configuration. The line is not a
bureaucratic inconvenience. It makes a change legible: a core change strengthens
the shared contract; an application change expresses a local decision.

# Accounts Are One Person, Not One Login Button

Multi-user workspaces become untrustworthy when identity is scattered across
one-off login paths. Verdun's account surface treats an account as a durable
person-or-organization record that can have verified identities, sessions, and
application-specific access without becoming a global bucket for every product
decision.

The public account modules expose Google verification, linked Google and email
identities, password-backed email accounts, one-time email link/code
challenges, sessions, and secure cookies. An identity is resolved only after
provider verification; an unverified email supplied by a browser is not enough.
This creates a useful invariant: one verified Google subject cannot silently
move to another account, and a Google identity plus a verified email with the
same normalized address can resolve to the same account.

Plans live beside this system but do not replace authorization. Verdun separates
applications, plan families, plans, prices, entitlements, subscriptions, and
plan transitions. Product roles remain application-owned. Commercial state is
therefore auditable without letting a payment tier impersonate a permission.
The account system is a federation point, not a monolith.

# A Database Is a Field Library

In the cover image, ledgers become a field library. The metaphor is deliberately
physical: a record is useful when it can be located, its source is known, and a
later reader can see how it arrived. Verdun's generic database shape has tables
for `instances`, `records`, `source_runs`, `collection_plans`, `review_state`,
and `focuses`, with reusable `workbench_*` views. The migration and public
facade keep the storage contract portable to applications without exposing an
application's private schema as framework law.

Neon Postgres is the normal durable endpoint. The guarded workflow generates a
load from a cohesive snapshot, checks that the SQL matches that snapshot, and
does nothing destructive by default. Applying the load is an explicit step;
afterward, a deployed check can require database-backed persistence rather than
accepting the local static fallback. The difference between a healthy demo and
a healthy production workbench is therefore observable.

The database is not a passive dumping ground. Source-run metadata and collection
plans make freshness and provenance part of the reading experience. A reviewer
can ask not only “what is here?” but “what collected this, when, under which
plan, and what was changed afterward?” That is what lets a shared workspace
remain a place of judgment rather than an opaque feed.

# Rust Engines, Not Rust Decorations

The crawler under `crawler/src/` is a runtime rather than an incidental script.
Its SDK exposes generic collection and snapshot contracts, HTTP and cache
helpers, artifact writers, progress events, checkpoints, and CLI entrypoints.
An application-owned crawler returns a `CrawlerCollection` with a core
`CrawlerSnapshot`; it does not need to copy the framework's internal modules or
shape its data around a legacy demo payload.

This is why the framework can be both flexible and disciplined. An application
can register its own Rust instance, own its fixtures and source adapters, and
choose its compatibility outputs. Verdun still receives a coherent generic
snapshot that can be stored, checked, and presented through the same workbench
contract. The engine supplies motion; the library keeps a trustworthy record of
where that motion went.

The public facade is `verdun_crawler::sdk`. It is intentionally a facade: an
external crate depends on the stable surface rather than reaching into `core` or
bundled instance internals. That boundary is the Rust equivalent of the
front-end's workbench contract. It allows evolution without forcing every
consumer to march in lockstep with implementation details.

The same rule now governs command-line work. Verdun publishes `verdun-cli` to
crates.io as the mothership CLI and shared Rust base for application CLIs. It
owns persisted token profiles, bearer-authenticated JSON requests, and a
neutral report that reads the workbench health contract as database, crawler,
and account state. An account tier is optional: an application without a
commercial plan is reported honestly as un-tiered rather than being forced into
a billing-shaped model.

Consumers pin an exact released version—for example, `verdun-cli = "=0.1.0"`—
instead of pointing at a sibling checkout. This is a small but important kind
of autonomy. A Suffix build can remain on the known-good crate it resolved,
even while Verdun continues to improve elsewhere. Upgrading the foundation is
then a deliberate, reviewed application decision, not an accidental side
effect of a nearby repository changing.

# Vercel Is a Route, Not a Sovereign

Vercel provides the delivery edge: a Vite app, serverless workbench APIs, and
deployment profiles that describe the neutral demo's base path and routes. The
framework does not claim every deployed application. It provides public helpers
for HTTP behavior, local fallback adapters, deployment-profile validation, and
generic readiness checks. An external application remains responsible for its
own domain route handlers, project identity, environment values, and policy.

This avoids a common false economy. A “unified” platform that absorbs every
domain decision looks convenient until its release process becomes impossible to
reason about. Verdun unifies the things that should be alike—status, snapshots,
health, persistence proofs, account mechanics—while letting domain behavior
remain local. The result is a dependable route from a Rust collection engine to
a Neon database to a Vercel-delivered review surface, not a claim that every
part of every application is the same.

# A Reader's Map of the Codebase

The book is also an invitation to read the codebase directly. Start with
`APP.md` for the current slice and ownership model, then `PUBLIC_SURFACE.md` for
the supported consumer seams. Follow `src/core/workbench.ts` into the Vue
composable and reusable components; follow `api/workbench/` into the generic
serverless routes; follow `db/migrations/0003_generic_workbench_tables.sql`
into the reload workflow; and follow `crawler/src/sdk.rs` into the Rust facade.

The accompanying Obsidian vault treats these paths as a navigable reading map.
It includes chapter notes, codebase notes, an index of source files, and links
from each architectural discussion to the concrete code that carries it. The
mobile vault is a separate reader product: complete in its text and code
orientation, compact in its assets and configuration, and safe to synchronize
independently from the complete research vault.

# Conclusion: Coordination Without Conquest

The systems that last are not necessarily those with the fewest boundaries.
They are the systems whose boundaries can be explained, checked, and extended.
Verdun brings that discipline to shared workspaces: a framework for many users,
many applications, and many sources to meet on stable ground.

Its field library remembers; its Rust engines collect; its Neon database makes
state durable; its Vercel surface makes the state available; and its account
layer lets a person remain one person across the paths they need. The aim is not
to reproduce a battle. It is to make collaboration more legible, more
inspectable, and more humane.
