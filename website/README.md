# Buraco website

Static pages for Cloudflare Pages (build output directory `website`, no build step):
`index.html`, `privacy.html` and `terms.html`, each in pt-BR and English, styled with the
design-system colours (`style.css`).

**Drafts.** Fill every highlighted placeholder before publishing. To list them:

```bash
grep -n 'class="todo"' website/*.html
```

The placeholders are the data controller's name and address, the contact email and the
"effective from" date.

The privacy policy describes what the code does. When data handling changes (a new
processor, a new kind of data, other retention), update `privacy.html` in the same change.
