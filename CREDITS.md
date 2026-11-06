# Credits and licenses

## 3D character models

**Zombie Apocalypse Kit** by **Quaternius** — CC0 1.0 (public domain).
- Source: https://quaternius.com/packs/zombieapocalypsekit.html
- License: https://creativecommons.org/publicdomain/zero/1.0/
- Files used, renamed for this project:
  - `Zombie_Basic.gltf`
  - `Zombie_Chubby.gltf`
  - `Zombie_Ribcage.gltf`
  - `Zombie_Arm.gltf`
  - `Hound_Shepherd.gltf` (Quaternius `Characters_GermanShepherd.gltf`)
  - `Hound_Pug.gltf` (Quaternius `Characters_Pug.gltf`)
  - `Matt.gltf`, `Lis.gltf`, `Sam.gltf`, `Shaun.gltf` — animated survivors used for remote players in multiplayer.

The models are animated glTF assets (idle, walk, run, attack, hit, death). They are tinted and scaled into several enemy variants at runtime. Survivor weapon attachment meshes are hidden at runtime; players are rendered as unarmed survivors with a name tag.

## Weapons, props and vehicles

The same **Zombie Apocalypse Kit** by **Quaternius** (CC0 1.0) supplies the following static glTF assets used in `public/models/`:

- Weapons: `Knife.gltf`, `Pistol.gltf`, `BatBarbed.gltf` (`WoodenBat_Barbed.gltf`), `BatSaw.gltf` (`WoodenBat_Saw.gltf`).
- `Axe.gltf` is a fire-axe-style model used as the **pickaxe** in game.
- Props: `Barrel.gltf`, `ContainerGreen.gltf` (`Container_Green.gltf`), `ContainerRed.gltf` (`Container_Red.gltf`), `Couch.gltf`, `FireHydrant.gltf`, `Pallet.gltf`, `PlasticBarrier.gltf`, `StreetLights.gltf`, `TownSign.gltf`, `TrafficCone.gltf`, `TrafficLight.gltf`, `TrashBag.gltf`, `WaterTower.gltf`.
- Vehicles: `Pickup.gltf`, `Sports.gltf`, `Truck.gltf`.

**Wood Axe** by **Quaternius** — CC0 1.0, downloaded from Poly Pizza.
- Source: https://poly.pizza/m/Ydd561XKRy
- File: `public/models/weapons/WoodAxe.glb` (used for the axe; the steel head is a separate material applied at runtime).

## Sound effects

All sound effects are downloaded from **Freesound** and released under **Creative Commons 0 (CC0 1.0)**. Files were trimmed, mono-mixed and normalised for this project; the originals remain under the licence below.

- `foot_grass.mp3` — *Hiking Boot Footsteps on Grass* by **Fission9** — https://freesound.org/s/521587/
- `foot_dirt.mp3` — *dirt/gravel footstep 3* by **Yoyodaman234** — https://freesound.org/s/223154/
- `water_splash.mp3` — *water_splash_10shots.wav* by **vibe_crc** — https://freesound.org/s/50623/
- `wood_chop.mp3` — *Axe chopping wood* by **xkeril** — https://freesound.org/s/753925/
- `wood_break.mp3` — *wood breaking.aiff* by **SoundCollectah** — https://freesound.org/s/109359/
- `stone_hit.mp3` — *impact-stone-heavy.wav* by **kasparsj** — https://freesound.org/s/513694/
- `stone_break.mp3` — *stone falls and breaks low pitch.aiff* by **SoundCollectah** — https://freesound.org/s/109360/
- `whoosh.mp3` — *whoosh_short_mid.wav* by **DJT4NN3R** — https://freesound.org/s/449996/
- `flesh_hit.mp3` — *Punches and hits* by **DSPena** — https://freesound.org/s/241950/
- `pain_grunt.mp3` — *Voice_AdultMale_PainGrunts_09.wav* by **MrFossy** — https://freesound.org/s/547209/
- `zombie_growl1.mp3` — *Zombie Growl 5.wav* by **tonsil5** — https://freesound.org/s/555417/
- `zombie_growl2.mp3` — *Zombie Growl 02* by **Ezcah** — https://freesound.org/s/204820/
- `zombie_scream.mp3` — *Zombie scream* by **mrsoundguy84859983975479387597** — https://freesound.org/s/678437/
- `zombie_death.mp3` — *Zombie Death 1.wav* by **tonsil5** — https://freesound.org/s/555412/
- `zombie_crowd.mp3` — *Crowd Of Zombies Groaning* by **LegoCustomZone** — https://freesound.org/s/764032/
- `gunshot.mp3` — *Single Pistol Gunshot 3.wav* by **morganpurkis** — https://freesound.org/s/385811/
- `rifle_shot.mp3` — *Rifle gunshot, one shot* by **felix.blume** — https://freesound.org/s/710084/
- `bow_release.mp3` — *Bow Release (Bow and Arrow) 4* by **Ali_6868** — https://freesound.org/s/384917/
- `arrow_hit.mp3` — *ARROW_WOOD_IMPACT_SINGLE_ARCHERY_01.wav* by **JoeDinesSound** — https://freesound.org/s/534956/
- `wind_day.mp3` — *Open_field_winds_summer_ambience.wav* by **nickmaysoundmusic** — https://freesound.org/s/523374/
- `wind_night.mp3` — *Deep wind night ambience in village* by **eniru** — https://freesound.org/s/640219/
- `crickets.mp3` — *Crickets At Night - Raw sound* by **Defelozedd94** — https://freesound.org/s/522299/
- `heartbeat.mp3` — *heartbeat-80bpm-limited.wav* by **loudernoises** — https://freesound.org/s/332819/
- `ui_click.mp3` — *UI_Click.wav* by **finix473** — https://freesound.org/s/546974/
- `cloth.mp3` — *Cloth Rustle 5.wav* by **zazz.sound.design** — https://freesound.org/s/435294/

Gameplay sounds fall back to the procedural synthesiser if a sample cannot be loaded.

## Engine and libraries

- **Three.js** — MIT License — https://threejs.org/
- **Vite**, **TypeScript** — MIT / Apache-2.0.
- **ws** — MIT License — WebSocket server for multiplayer.

All other art — voxel textures, block icons, item icons and UI — is generated procedurally for this project.
