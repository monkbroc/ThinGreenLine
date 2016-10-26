// From StackOverflow
// http://stackoverflow.com/a/6930407/1901924
#pragma once

typedef struct {
    unsigned char r;
    unsigned char g;
    unsigned char b;
} RgbColor;

typedef struct {
    unsigned char h;
    unsigned char s;
    unsigned char v;
} HsvColor;

HsvColor RgbToHsv(RgbColor in);
RgbColor HsvToRgb(HsvColor in);
