# Loomee blog posts

Each Markdown file in this folder is one article. Adding or changing a file publishes it on the
blog in about 1–2 minutes. Deleting a file takes the article down.

- **Web address:** taken from the file name. `best-led-notification-light-apps.md` becomes
  `/loomee-blog/best-led-notification-light-apps/`. Keep a file's name the same once it is live.
- **Top of the file (optional):**

  ```
  ---
  title: "How to Get a Notification Light on Any Android Phone"
  description: "Shown in Google results, about 150 characters."
  date: 2026-11-25
  image: images/notification-light.jpg
  keywords: ["notification light", "LED notification"]
  ---
  ```

  Other common names work too, for example `excerpt`, `publishedAt`, `coverImage` and `tags`.
  `draft: true` keeps a file off the blog.
- **No header?** A first line of `# Title` is used as the title. A `Meta description: ...` line
  becomes the Google description and is removed from the article. If there is no date, the day
  the file was added is used.
- **Pictures:** use a web address, or put the picture in this repo (for example `posts/images/`)
  and link it as `![What the picture shows](images/name.jpg)`.

This README file is not published.
