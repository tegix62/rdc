building the fake Presentation host from studio/node_modules...
  built (172 KB)

1. Handshake

    +    0ms  embedding https://preview.rumeau-design-co.pages.dev/about
    +  879ms  iframe fired load
    +  885ms  status -> idle
    +  886ms  status -> handshaking
    +  888ms  channel started, waiting for the page to answer
    +  954ms  status -> connected

  ok   Presentation connected to the site

2. The Edit toggle

    overlay state on connect: {"hostExists":true,"childCount":7,"elementsMarked":0}
    after one toggle:         {"hostExists":true,"childCount":1,"elementsMarked":0}
    after toggling back:      {"hostExists":true,"childCount":7,"elementsMarked":0}

  ok   the site has an overlay host element
  ok   toggling turns the overlay off
  ok   toggling again turns it back on

3. Hovering something an editor would click

    text nodes carrying stega: 15 (19640 marker chars)
      <h1> "Chris Rumeau"
      <p> "My name's Chris. Rumeau Design Co (RDC) "
      <p> "I sketch extensively before anything goe"
      <p> "I studied design academically (Pratt Ins"
      <p> "I work best with clients who already hav"
      <span.peek__caption> "Adelante Barbell Club"
      <span.peek__caption> "Hug a Mug Coffeehouse & Ceramics Studio"
      <span.peek__caption> "DumpStat, a D&D Podcast"
      <span.peek__caption> "Chateau Seven"
      <a.site-footer__social-link> "Instagram"
      <a> "Adelante Barbell Club"
      <a> "Chateau Seven"
      <a> "DumpStat, a D&D Podcast"
      <a> "Hug a Mug Coffeehouse & Ceramics Studio"
      <a> "Two Point Oh"
    a @977,36 "Portfolio" -> highlighted 1440x900
    a @1055,36 "About" -> highlighted 1440x900
    a @1123,36 "Video" -> highlighted 1440x900
    a @1220,36 "Contact" -> highlighted 1440x900
    h1 @904,154 "Chris Rumeau" -> highlighted 1440x900
    p @815,238 "My name's Chris. Rumeau Design C" -> highlighted 1440x900

    overlay DOM: div.sc-pilFg ihoqSM div.StyledBox-sc-1hhky9f-0 k div.StyledBox-sc-1hhky9f-0 k div.StyledBox-sc-1hhky9f-0 k div.StyledBox-sc-1hhky9f-0 k div.StyledBox-sc-1hhky9f-0 k div.StyledBox-sc-1hhky9f-0 k
  ok   hovering draws an editable target
    +    0ms  embedding https://preview.rumeau-design-co.pages.dev/about
    +  879ms  iframe fired load
    +  885ms  status -> idle
    +  886ms  status -> handshaking
    +  888ms  channel started, waiting for the page to answer
    +  954ms  status -> connected
    +  994ms  page -> visual-editing/toggle {"enabled":true}
    + 1029ms  page -> visual-editing/toggle {"enabled":false}
    + 2532ms  page -> visual-editing/toggle {"enabled":true}

  console from inside the frame:
    [info] [sanity] visual editing mounted in 600ms

  screenshot: audit/handshake.png

All checks passed.
