# Verdun Vault

The full Verdun Vault is a desktop codebase-reading edition of *Verdun: A
Framework for Shared Work*. Open `Home.md`, then follow the Book, Architecture,
Examples, and Codebase Index routes. Every listed code note is generated from
the current Verdun source tree and links back to the vault's reading map.

The archive deliberately omits Obsidian's volatile saved workspace layouts.
Use it as a separate desktop vault; it is not the compact phone product.

To regenerate, quit Obsidian first, then run:

```sh
python3 publishing/verdun/scripts/build-obsidian-vault.py
python3 publishing/verdun/scripts/check-obsidian-vault.py \
  'publishing/verdun/dist-obsidian/Verdun Vault'
```
