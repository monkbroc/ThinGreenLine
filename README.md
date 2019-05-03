# Thin Green Line

Gotta keep it green



## 2019 build directions

1. bump the version
2. build it:

```
cd firmware/modules/
make all PLATFORM=photon APPDIR=$HOME/dev/for_fun/ThinGreenLine/Firmware MODULAR=y
```

3. upload the binary
4. release the new version

Then go in and set the variables how you like.
