# Manrope

`Manrope-Variable.woff2` is the font the widget serves: Manrope (SIL Open Font License 1.1, see
`OFL.txt`; no Reserved Font Name) cut down to what the interface needs, 28 KB instead of 165 KB.
Characters it lacks fall back to the system font.

`source/Manrope-Variable.ttf` is the upstream file it comes from
(<https://github.com/googlefonts/manrope>), not published. To rebuild:

```sh
pip install fonttools brotli
python3 -m fontTools.varLib.instancer source/Manrope-Variable.ttf wght=400:800 -o /tmp/instance.ttf
python3 -m fontTools.subset /tmp/instance.ttf --flavor=woff2 --layout-features='*' \
  --unicodes="U+0020-007E,U+00A0-017F,U+2010-2015,U+2018-201E,U+2022,U+2026,U+2030,U+2039-203A,U+20AC,U+2122,U+2190-2193,U+2212" \
  --output-file=Manrope-Variable.woff2
```

Weights 400 to 800 are all the interface uses (`style.css`).
