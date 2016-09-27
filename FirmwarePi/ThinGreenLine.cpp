#include "application.h"
#include "dotstar.h"
#include "gamma.h"

SYSTEM_MODE(AUTOMATIC);
//PRODUCT_ID(1540);
//PRODUCT_VERSION(2);

uint32_t Wheel(byte WheelPos);

// IMPORTANT: Set pixel COUNT, PIN and TYPE
#define PIXEL_DATA_PIN 24
#define PIXEL_CLK_PIN 23
#define PIXEL_COUNT 144

#define BRIGHTNESS 10
#define ENABLE_RAINBOW 1

Adafruit_DotStar strip = Adafruit_DotStar(PIXEL_COUNT, PIXEL_DATA_PIN, PIXEL_CLK_PIN, DOTSTAR_BGR);

enum BuildStatus_e {
  BUILD_NONE = 0,
  BUILD_PASS = 1,
  BUILD_FAILED = 2,
  BUILD_RUNNING = 3,
  BUILD_RUNNING_PASS = BUILD_RUNNING,
  BUILD_RUNNING_FAILED = 4,
};

BuildStatus_e buildStatus[PIXEL_COUNT];

bool allBuildsPass = false;

static uint8_t hex2dec(char c) {
    if (c >= '0' && c <= '9')
        return c - '0';
    if (c >= 'a' && c <= 'f')
        return c - 'a' + 10;
    if (c >= 'A' && c <= 'F')
        return c - 'A' + 10;
    return 0xFF;
}

void updateBuildStatus(unsigned system, uint8_t encodedStatus) {
  switch(encodedStatus) {
    case BUILD_NONE:
    case BUILD_PASS:
    case BUILD_FAILED:
      buildStatus[system] = (BuildStatus_e) encodedStatus;
      break;
    case BUILD_RUNNING:
      if (buildStatus[system] == BUILD_FAILED || buildStatus[system] == BUILD_RUNNING_FAILED) {
        buildStatus[system] = BUILD_RUNNING_FAILED;
      } else {
        buildStatus[system] = BUILD_RUNNING_PASS;
      }
      break;
  }
}

void updateAllPass(unsigned systemCount) {
  bool pass = true;
  for (unsigned i = 0; i < systemCount; i++) {

    if (buildStatus[i] == BUILD_FAILED || buildStatus[i] == BUILD_RUNNING_FAILED) {
      pass = false;
      break;
    }
  }

  allBuildsPass = pass;
}

void setBuildStatus(const char *event, const char *data) {
  String encoded(data);

  unsigned system = 0;
  for (unsigned i = 0; i < encoded.length() && i < PIXEL_COUNT/2; i++, system += 2) {
    uint8_t hex = hex2dec(encoded[i]);
    updateBuildStatus(system, hex >> 2);
    updateBuildStatus(system + 1, hex & 0x3);
  }
  for (unsigned j = system; j < PIXEL_COUNT; j++) {
    buildStatus[j] = BUILD_NONE;
  }

  updateAllPass(system);
}

void setup()
{
  Particle.subscribe("build", setBuildStatus, MY_DEVICES);
  strip.begin();
  strip.setBrightness(BRIGHTNESS);
  strip.show(); // Initialize all pixels to 'off'
}

uint16_t rainbow = 0;
uint8_t fade = 0;
int8_t fadeDirection = 1;


uint32_t colorForRainbow(unsigned i) {
  return Wheel((uint8_t) (i + rainbow >> 2));
}

uint32_t stripColor(uint8_t r, uint8_t g, uint8_t b) {
  return strip.Color(CORRECT_GAMMA(r, g, b));
}

uint32_t colorForBuildStatus(unsigned i, BuildStatus_e st) {
  if (st == BUILD_NONE) {
    return 0;
  }

  if (ENABLE_RAINBOW && allBuildsPass) {
    return colorForRainbow(i);
  }

  switch (st) {
    case BUILD_PASS: return stripColor(0, 255, 0);
    case BUILD_FAILED: return stripColor(255, 0, 0);
    case BUILD_RUNNING_PASS: return stripColor(0, 255 - fade, 0);
    case BUILD_RUNNING_FAILED: return stripColor(255 - fade, 0, 0);
    default: return 0;
  }
}

void showBuildStatus() {
  for (unsigned i = 0; i < strip.numPixels(); i++) {
    strip.setPixelColor(i, colorForBuildStatus(i, buildStatus[i]));
  }
  strip.show();
}

void updateFade() {
  fade = (uint8_t) (fade + fadeDirection);
  if (fade == 255 || fade == 0) {
    fadeDirection = -fadeDirection;
  }
}

void updateRainbow() {
  rainbow++;
}

void loop()
{
  showBuildStatus();
  updateFade();
  updateRainbow();
  delay(5);
}

// Input a value 0 to 255 to get a color value.
// The colours are a transition r - g - b - back to r.
uint32_t Wheel(byte WheelPos) {
  if(WheelPos < 85) {
   return stripColor(WheelPos * 3, 255 - WheelPos * 3, 0);
  } else if(WheelPos < 170) {
   WheelPos -= 85;
   return stripColor(255 - WheelPos * 3, 0, WheelPos * 3);
  } else {
   WheelPos -= 170;
   return stripColor(0, WheelPos * 3, 255 - WheelPos * 3);
  }
}
