# Verdun Mobile Vault

The Verdun Mobile Vault is a separate phone and tablet reader product. It
contains the complete eight-page book Reader and a compact set of five
architecture examples; it intentionally excludes the complete codebase index.

Open `Home.md` after importing it. Keep it on a dedicated Obsidian Sync remote,
separate from the full desktop Vault. The static Markdown reader works without
community plugins.

To regenerate, quit Obsidian first, then run:

```sh
python3 publishing/verdun/scripts/build-obsidian-mobile-vault.py
python3 publishing/verdun/scripts/check-obsidian-mobile-vault.py \
  'publishing/verdun/dist-obsidian/Verdun Mobile Vault'
```
