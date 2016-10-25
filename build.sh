#!/bin/bash
set -x
set -e

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
FIRMWARE=~/Programming/firmware

docker run --rm -it -v $FIRMWARE:/firmware -v $DIR/FirmwarePi:/input -v $DIR:/output -e MAKE_ARGS="$MAKE_ARGS" particle/buildpack-raspberrypi $*
arm-unknown-linux-gnueabi-strip firmware.bin
scp firmware.bin pi@`rpi_ip`:~/firmware/ci
