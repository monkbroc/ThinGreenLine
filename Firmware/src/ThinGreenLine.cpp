#include "application.h"
#include "lib/dotstar.h"
#include "lib/gamma.h"
#include "lib/hsv.h"

SYSTEM_MODE(AUTOMATIC);

#if PLATFORM_ID == 6 // Photon
PRODUCT_ID(1540);
PRODUCT_VERSION(10);
SYSTEM_THREAD(ENABLED);
#else
// No product ID for Raspberry Pi
#endif

#define PIXEL_COUNT 90
#define BRIGHTNESS 10
#define ENABLE_RAINBOW 1
#define RAINBOW_SPACING 10

#if PLATFORM_ID == 6
// Use hardware SPI for Dotstar (A3 and A5) on Photon
Adafruit_DotStar strip = Adafruit_DotStar(PIXEL_COUNT, DOTSTAR_BGR);
#define RAINBOW_DELAY 2
#else
// Use software SPI pins for Dotstar on Raspberry Pi
#define PIXEL_DATA_PIN 24
#define PIXEL_CLK_PIN 23
Adafruit_DotStar strip = Adafruit_DotStar(PIXEL_COUNT, PIXEL_DATA_PIN, PIXEL_CLK_PIN, DOTSTAR_BGR);
#define RAINBOW_DELAY 1
#endif

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
unsigned systemCount = 0;

void setBuildStatus(const char *event, const char *data);
void saveBuildStatus(const char *data);
void restoreBuildStatus();
static uint8_t hex2dec(char c);
void updateBuildStatus(unsigned system, uint8_t encodedStatus);
void updateSystemCount();
void updateAllPass();
int setBrightness(String newValueString);
int forceRainbow(String);
void showBuildStatus();
uint32_t colorForBuildStatus(unsigned i, BuildStatus_e st);
uint32_t colorForRainbow(unsigned i);
uint32_t stripColor(uint8_t r, uint8_t g, uint8_t b);
void updateFade();
void updateRainbow();

void setup()
{
  Particle.subscribe("build", setBuildStatus, MY_DEVICES);
  Particle.function("rainbow", forceRainbow);
  Particle.function("brightness", setBrightness);
  strip.begin();
  strip.setBrightness(BRIGHTNESS);
  strip.show(); // Initialize all pixels to 'off'
  restoreBuildStatus();
}

void setBuildStatus(const char *event, const char *data) {
  String encoded(data);
  saveBuildStatus(data);

  unsigned system = 0;
  for (unsigned i = 0; i < encoded.length() && i < PIXEL_COUNT/2; i++, system += 2) {
    uint8_t hex = hex2dec(encoded[i]);
    updateBuildStatus(system, hex >> 2);
    updateBuildStatus(system + 1, hex & 0x3);
  }
  for (unsigned j = system; j < PIXEL_COUNT; j++) {
    buildStatus[j] = BUILD_NONE;
  }

  updateSystemCount();
  updateAllPass();
}

void saveBuildStatus(const char *data) {
  char buf[PIXEL_COUNT+1];
  memset(buf, 0, sizeof(buf));
  strcpy(buf, data);
  for (int i = 0; i < sizeof(buf); i++) {
    EEPROM.write(i, buf[i]);
  }
}

void restoreBuildStatus() {
  char buf[PIXEL_COUNT+1];
  for (int i = 0; i < sizeof(buf); i++) {
    buf[i] = EEPROM.read(i);
  }
  buf[PIXEL_COUNT] = '\0';
  setBuildStatus("", buf);
}

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
    default:
      buildStatus[system] = BUILD_NONE;
      break;
  }
}

void updateSystemCount() {
  for (unsigned i = 0; i < PIXEL_COUNT; i++) {
    if (buildStatus[PIXEL_COUNT - i - 1] != BUILD_NONE) {
      systemCount = PIXEL_COUNT - i;
      return;
    }
  }
  systemCount = 0;
}

void updateAllPass() {
  bool pass = true;
  for (unsigned i = 0; i < systemCount; i++) {

    if (buildStatus[i] == BUILD_FAILED || buildStatus[i] == BUILD_RUNNING_FAILED) {
      pass = false;
      break;
    }
  }

  allBuildsPass = pass;
}

int setBrightness(String newValueString) {
  int newValue = newValueString.toInt();
  strip.setBrightness(newValue);
  return newValue;
}

int forceRainbow(String) {
  allBuildsPass = true;
  if (systemCount == 0) {
    systemCount = PIXEL_COUNT;
  }
  return 0;
}

uint16_t rainbow = 0;
uint8_t fade = 0;
int8_t fadeDirection = 1;

void loop()
{
  showBuildStatus();
  updateFade();
  updateRainbow();
  delay(RAINBOW_DELAY);
}

void showBuildStatus() {
  for (unsigned i = 0; i < strip.numPixels(); i++) {
    strip.setPixelColor(i, colorForBuildStatus(i, buildStatus[i]));
  }
  strip.show();
}

uint32_t colorForBuildStatus(unsigned i, BuildStatus_e st) {
  if (ENABLE_RAINBOW && allBuildsPass && i < systemCount) {
    return colorForRainbow(i);
  }

  if (st == BUILD_NONE) {
    return 0;
  }

  switch (st) {
    case BUILD_PASS: return stripColor(0, 255, 0);
    case BUILD_FAILED: return stripColor(255, 0, 0);
    case BUILD_RUNNING_PASS: return stripColor(0, 255 - fade, 0);
    case BUILD_RUNNING_FAILED: return stripColor(255 - fade, 0, 0);
    default: return 0;
  }
}

uint32_t colorForRainbow(unsigned i) {
  HsvColor hsv;
  hsv.h = (uint8_t)(rainbow - RAINBOW_SPACING * i);
  hsv.s = 255;
  hsv.v = 255;
  RgbColor rgb = HsvToRgb(hsv);
  return (uint32_t)(rgb.r << 16) | (uint32_t)(rgb.g << 8) | (uint32_t)(rgb.b);
}

uint32_t stripColor(uint8_t r, uint8_t g, uint8_t b) {
  return strip.Color(CORRECT_GAMMA(r, g, b));
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
