# aaditya420.github.io

Personal portfolio of Aaditya Verma: https://aaditya420.github.io/

The page is a one-minute scroll film. Scroll position is the playhead, and the play button scrolls it for you.
It is a static site with no build step and no dependencies.

| File | What it does |
| --- | --- |
| `index.html` | The scenes and all copy |
| `css/film.css` | Palette, type and the scroll-driven text effects |
| `js/cloud.js` | The WebGL particle cloud and the shapes it morphs between |
| `js/film.js` | Timeline: scenes, wipes, counters, autoplay and seeking |
| `fonts/` | Anybody and Fraunces Italic, self-hosted (SIL Open Font License 1.1) |
| `Aaditya_Verma_Resume.pdf` | Downloadable resume |

To preview locally: `python3 -m http.server` and open http://localhost:8000.

To change the film, edit a `<section class="scene">` in `index.html`. `data-dur` is its length in screens,
`data-wipe` is how it cuts in, `data-shape` is what the particles form, and each `data-a="start,end"` is when
an element animates within the scene (0 to 1).
