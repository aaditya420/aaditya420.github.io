# aaditya420.github.io

Personal portfolio of Aaditya Verma: https://aaditya420.github.io/

The page is a one-minute scroll film. Scroll position is the playhead, and the play button scrolls it for you.

How it behaves:
- Each scene has a beat, the moment its words are complete. Autoplay eases into each beat, holds it long enough to read, then moves on.
- When you scroll by hand and stop between beats, the film glides to the next beat in the direction you were going, so it never rests on a half-drawn frame.
- The bar at the top has one segment per chapter, sized by running time. Tap a segment to jump, drag along it to scrub.
- The dock at the bottom has play/pause (with a progress ring), the current chapter, and previous/next beat.
- Keys: Space or K plays and pauses, arrows step between beats, Home and End jump to the start and the end.
- Chapters opens a menu of every chapter plus the contact links.
It is a static site with no build step and no dependencies.

| File | What it does |
| --- | --- |
| `index.html` | The scenes and all copy |
| `css/film.css` | Palette, type and the scroll-driven text effects |
| `js/cloud.js` | The WebGL particle cloud and the shapes it morphs between |
| `js/film.js` | Timeline: scenes, wipes, counters, beats, autoplay, snapping, the dock, timeline and menu |
| `fonts/` | Anybody and Fraunces Italic, self-hosted (SIL Open Font License 1.1) |
| `Aaditya_Verma_Resume.pdf` | Downloadable resume |

To preview locally: `python3 -m http.server` and open http://localhost:8000.

To change the film, edit a `<section class="scene">` in `index.html`. `data-dur` is its length in screens,
`data-wipe` is how it cuts in, `data-shape` is what the particles form, and each `data-a="start,end"` is when
an element animates within the scene (0 to 1). `data-title` names the chapter. A scene's reveals are
compressed into its first 60% automatically; the career scene sets its own beats with `data-beats`.
