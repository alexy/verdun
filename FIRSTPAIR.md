---
slug: verdun
shelf: publishing
---

# First Pair delivery

Verdun's book source lives at `publishing/verdun/`. Build the full edition from
the repository root with:

```sh
~/src/firstpair/publishing/scripts/build-library-book.sh \
  --repo-root "$PWD" --config book.build.json --edition full
```

The First Pair source-of-truth contract is `~/src/firstpair/AGENTS.md`.
Publish only after the source build, book validators, and both vault validators
pass. Full and mobile vaults are generated products; close their target vaults
in Obsidian before regenerating or packaging them.

The full vault builder is `publishing/verdun/scripts/build-obsidian-vault.py`;
the mobile reader builder is `publishing/verdun/scripts/build-obsidian-mobile-vault.py`.
Their companion validators accept the generated vault directory as an argument.

`vault.build.json` binds both builders to FirstPair's transactional candidate,
complete-guide, privacy, comparison, and deterministic archive gates. Generated
candidates remain beside, and never replace, the established vaults during QA.
