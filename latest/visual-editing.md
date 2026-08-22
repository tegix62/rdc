building the fake Presentation host from studio/node_modules...
  built (172 KB)

1. Handshake

    +    0ms  embedding https://preview.rumeau-design-co.pages.dev/about
    +  896ms  iframe fired load
    +  902ms  status -> idle
    +  903ms  status -> handshaking
    +  905ms  channel started, waiting for the page to answer
    +  934ms  status -> connected
    +  971ms  page -> visual-editing/toggle {"enabled":true}

  ok   Presentation connected to the site

2. The Edit toggle

    overlay state on connect: {"hostExists":true,"childCount":8,"elementsMarked":0}
    after one toggle:         {"hostExists":true,"childCount":1,"elementsMarked":0}
    after toggling back:      {"hostExists":true,"childCount":8,"elementsMarked":0}

  ok   the site has an overlay host element
  ok   toggling turns the overlay off
  ok   toggling again turns it back on

3. Hovering something an editor would click

    text nodes carrying stega: 6 (8696 marker chars)
      <h1> "Chris Rumeau"
      <p> "My name's Chris. Rumeau Design Co (RDC) "
      <p> "I sketch extensively before anything goe"
      <p> "I studied design academically (Pratt Ins"
      <p> "I work best with clients who already hav"
      <a.site-footer__social-link> "Instagram"
    a @977,36 "Portfolio" -> highlighted 1440x900
    a @1055,36 "About" -> highlighted 1440x900
    a @1123,36 "Video" -> highlighted 1440x900
    a @1220,36 "Contact" -> highlighted 1440x900
    h1 @904,106 "Chris Rumeau" -> highlighted 1440x900
    p @815,190 "My name's Chris. Rumeau Design C" -> highlighted 1440x900

    overlay DOM: div.sc-pilFg ihoqSM div.StyledBox-sc-1hhky9f-0 k div.StyledBox-sc-1hhky9f-0 k div.StyledBox-sc-1hhky9f-0 k div.StyledBox-sc-1hhky9f-0 k div.StyledBox-sc-1hhky9f-0 k div.StyledBox-sc-1hhky9f-0 k div.StyledBox-sc-1hhky9f-0 k
  ok   hovering draws an editable target
    +    0ms  embedding https://preview.rumeau-design-co.pages.dev/about
    +  896ms  iframe fired load
    +  902ms  status -> idle
    +  903ms  status -> handshaking
    +  905ms  channel started, waiting for the page to answer
    +  934ms  status -> connected
    +  971ms  page -> visual-editing/toggle {"enabled":true}
    + 1015ms  page -> visual-editing/toggle {"enabled":false}
    + 2516ms  page -> visual-editing/toggle {"enabled":true}

  console from inside the frame:
    [info] [sanity] visual editing mounted in 582ms

  screenshot: audit/handshake.png

All checks passed.
