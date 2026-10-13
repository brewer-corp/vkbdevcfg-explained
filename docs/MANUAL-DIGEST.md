# VKB NJoy32 Configuration Utility (VKBDevCfg) — Technical Manual Digest

**Source:** `work/re/dist/manual.txt` — "NJoy32 Family Controllers / Configuration Utility / User guide", **V. 2.19, 16.08.2023**, ©2023 VKB, "Written by VictorUs". 163 pages, 13 chapters + Appendix I. 189 figure references (figures are raster images — they are *not* in the text extraction, so this digest is built from captions and prose only). Extracted with `pdftotext -layout`, so all diagram content (i.e. the actual dialog layouts) is missing.

Document structure:
- Ch.1 Overview (p.15) · Ch.2 Using configurator (p.19) · Ch.3 Axes setup (p.30) · Ch.4 Physical buttons (p.48) · Ch.5 Logical button functions (p.101) · Ch.6 HAT/POV parameters (p.114) · Ch.7 Boolean functions (p.118) · Ch.8 Macro setup (p.133) · Ch.9 Service functions (p.137) · Ch.10 Testing controls (p.140) · Ch.11 Indication configuration (p.143) · Ch.12 Network technologies (p.153) · Appendix I Zconfig.ini (p.163)

---

## 0. TL;DR for a reimplementer

1. **The device is a real-time signal processor, not a remapper.** Almost every "logical" feature in this tool is executed *in firmware on the controller*, not in the PC tool. The PC tool's job is to push a parameter block into the device and pull it back out. That has a major consequence for a replacement UI: **you cannot implement any of this behaviour in software on the host**; you can only generate the same parameter block. There is no documented protocol for that block.
2. **The configuration model is a 4-layer pipeline**, not a simple input→output map: `Physical line/axis → Physical function → Logical line → Logical function (HAT/Keyboard/Mouse/Macro/Media/Sys)`, with orthogonal cross-cutting blocks for Axes, Booleans, Triggers, Macros, LEDs and BUS networking.
3. **"Line" is the universal currency.** 128 physical lines, grouped 8-per-register into `Reg#1…Reg#16`. Physical line numbers are fixed by wiring; everything else is remapping.
4. **There is no automation surface.** No command line, no scripting, no API, no documented file format. The *only* documented interop points are: `zconfig.ini` (startup INI), `.cfg` profile files (format entirely undocumented), `.mcr` macro files, drag-and-drop of a `.cfg` onto the window, and **clipboard copy/paste of a button's parameter set**.
5. **Feasibility verdict:** a "more intuitive UI" that *drives the existing VKBDevCfg* is viable only via UI automation, since no scriptable interface exists. A *reimplementation* that talks to the device is blocked on reverse-engineering the (undocumented) USB/HID transport and the `.cfg` container. See §7 for detail.

---

## 1. THE CONFIGURATION MODEL

### 1.1 The core abstraction: "lines"

This is the single most important fact and the manual states it explicitly.

> **§4.1 Overview (p.48):** "When we describe joystick we use common term Button. Really it can be any device that can close two contacts. For example it can be tact switch, toggle switch, HAT switch, rotary switch, encoder etc. **Every pair of button contacts is represented as single line.** So simple button occupies one line, toggle switch On–Off–On – two lines, 4–way HAT – 4. **Njoy32 controller can process up to 128 lines.**"

> **§4.1:** "Every eight lines are grouped to registers, Reg#1...Reg#16. Lines have consequent numbers."

So: 128 lines ÷ 8 = 16 registers. This matches the internal SPI bus described in §12.2.2 ("SPI1 port controls internal button registers… `S-but – standard button registers, 8 buttons each, connected`").

> **§5.1 Overview (p.101):** "Each of joystick control is connected to controller by single (button, single-state toggle switch) or several (encoder, HAT, Two-state toggle switch) lines. Physically line corresponds to pair of conductors with a specific number… Physical line signal is received by controller. **But operation system and the game will receive just logical signal.** By default if no logical function is applied, line numbers will be the same."

### 1.2 The four layers

```
PHYSICAL INPUT      physical line #  (1..128, wired, 8/register)
   |               sensor / encoder / switch contact
   v
PHYSICAL FUNCTION  Button, ButAlt, RadioButton, ButtonS/X/D/M, Shift,
   |               SubShift, Toggle, Encoder, Cyclic, POV, uStick, uPOV,
   |               SwitchCB, Generator, Tempo, Trimmer, Curves, Fix_Axes,
   |               AuxAxes, RelAxes, DZ switch, RPB, Sync, NoF
   v
LOGICAL LINE       virtual/logical button # (1..128) - what the OS sees
   |               + axes / POVs / triggers that this line feeds
   v
LOGICAL FUNCTION   Button, HAT, Keyboard, Mice, Macro, Audio,
                   Multimedia, Application, System, No Function, Void
```

- **§4.2 (p.48)** enumerates the 26 physical-layer functions.
- **§5.2.3 / Table 5.1 (p.104)** enumerates the 11 logical-layer functions.
- **§5.2.1 (p.101):** "Some physical functions have no access to logical functions, **Shift for example**."

### 1.3 Physical axes vs logical axes

**Hard limit of 8 axes per controller** (§3.1 p.30): "Maximum axes number that single controller can process is eight."

**§3.1** lists the sensor types: "digital D_MaRS sensor, A_MaRS sensor (similar to D_MaRS, Gladiator family, 4-wired), V_MaRS (virtual, Gladiator twist, Gunfighter X&Y), analog sensors, potentiometers, encoders, buttons." And: "**Encoders and buttons are used for virtual axes.**"

**Physical axis tab** (Table 3.1, §3.2.1 p.30) configures the sensor front-end: sensor type, filtering, gain, bias, base quadrant, inversion, trim enable. **Logical axis tab** (Table 3.2, §3.3 p.33) configures the output: binding, mode, deadzone, precision, HID name, combine, forced limits.

**The mapping between them is 1:N, not 1:1** — this is the crucial architectural fact:

> **Table 3.2, §3.3 (p.34), `AxisID`:** "ID of binded physical axis. Binds logical axes to physical ones. **Single physical axis can be binded to several logical axes.**"

Worked example, **§3.5.4 BrakeV (p.37–38):** "Axes #2 and #3 have the same AxID as #4… Axis#4 is invisible (Vs is unchecked)." — three logical axes share one physical axis and one virtual button.

**Two gates, both required** (Table 3.2, §3.3 p.33):
> `En` — "Enabled, on/off axis… **Axis parameters are calculated even if it is invisible (Vs unchecked).** This mode you can use to convert axis rotation to button press sequence without axis response."
> `Vs` — "Visible in HID. Makes enabled axis visible. **Thus to use any axis you must set it as enable and visible!**"

Note this is a classic footgun and a prime target for a better UI: an axis can be computed, hidden, and still drive Axes2Buttons/Comparators/LED Gauge.

**Two different inversions** (a real reimplementation trap):
> `R` (§3.2.1 p.30) "Physical data inversion. Physical axis rotation reverse."
> `In` (§3.3 p.34) "Logical inversion of axis… **instead of physical inversion … that is applied to axis response at the beginning of output signal processing logical inversion is applied at the end. In most cases the result will be the same but sometimes inversion mode can be significant.**"

### 1.4 Virtual button / Virtual line / Logical line

The manual uses these near-interchangeably, which is itself confusing. Definitions found:

| Term | Manual definition | Where |
|---|---|---|
| **Physical line** | A conductor pair / register bit, fixed by wiring. Max 128. | §4.1, §5.1 |
| **Logical line** | The line number the OS/game sees. Remapped. "Virtual buttons engine allows to remap button numbers. By default button logical number (recognized by OS) is the same with physical one (specified by wiring)." | §5.3 (p.104), §5.1 |
| **Virtual line / "V. Button" / "VBut N"** | Used as the *counter name* for assigning a logical output line number on ButtonS/ButtonM/ButtonX/Cyclic/Axes2Buttons. §4.3.4: "Set index of subshift … and logical line number using counter **V. Button**. By default it is physical one +1." | §4.3.4, §4.3.7, §4.3.12, §7.2 |
| **"virtual button"** | The output event of a Boolean/Trigger (§7.2 example: "Virtual button #44 will be registered if physical #2 is pressed") and an LED event source (Table 11.2). Also the generic term for a software-only button. | §7.2, §11.1.3 |

**§4.2.1 (p.50)** — the crucial safety rule that shows logical lines are a *shared namespace*:
> "Assigning additional line be careful. This number must NOT be the same with existing physical button line. But you CAN assign such (occupied) number, **if this button line number was reassigned too.** For example, gun trigger occupies physical line number 17. If you want to use it with «beautiful» number reassign it to 1."

**Line occupancy is visible in the UI** (a genuinely nice affordance a new tool should copy): **§4.2.1 Free line choice (p.50):** "Dialog Virtual layer … **Red colored numbers are occupied, black – free.**" Duplicated at **§5.3.2 (p.105)**.

**AutoMapping** (§4.3.1 p.52, §5.3.1 p.104): the default is identity mapping; unchecking it exposes `BUT1`.

### 1.5 Virtual controllers (§2.4.7, p.26)

> "**VC, Virtual HID controllers – virtual controllers count.** Windows cannot recognize more than 8 axis for single controller. If you have more than 8 axes, enable virtual controller and assign axes to it. **Windows will see virtual controllers as physical.**"

- Referenced per-axis via `VC` counter (§4.3.13 POV, §6.4 Table 6.3 `VC#`, §3.7.3, §12.4.3).
- Range 1…8 per **§12.4.3 (p.156)**: "Set virtual controller of master devise number using `Bind extern axis to controller # (1…8)` for received axis, usually 1."
- **§12.4.2 (p.156):** "Set count of axes received from slave using AxN counter. Set count of button registers received from slave using RegN counter **and Base – register number in a common register array** for the first received register… **LedsN**… and **Base – LED number in a common LED array**."

So the addressing model is a **2-D space: (virtual controller index, axis/line/register/LED number)**. This is the direct workaround for the Windows/DirectInput 8-axis ceiling and it is a first-class part of the data model, not an afterthought.

### 1.6 "Virtual device" — a misnomer

**§2.4.9 is titled "Virtual devices"** but its entire body is about the **virtual keyboard**:

> **§2.4.9 (p.27):** "You can map joystick buttons to keystrokes… `Map` … **Do not forget to check MAP to allow keyboard mapping.** Mode combo box options: **Off** – virtual keyboard disabled; **Classic** – standard keyboard; simultaneously pressed virtual keys allowed; **Modified** – simultaneously pressed virtual keys disabled… **If Map checked and any virtual keyboard mode chosen new virtual device HID Keyboard Device will appear in device list.**"

So "virtual device" = a **separate HID collection the firmware exposes** ("HID Keyboard Device"), appearing alongside the joystick in the Windows device list. There are therefore at least three HID collections: joystick, virtual controller(s) (§2.4.7), virtual keyboard device (§2.4.9). Plus the virtual mouse, which **§6.3.4 (p.116)** implies is *not* a HID collection: "Enable or disable virtual mouse using control units on Global – Common tab."

Also relevant: **§2.1.1 Device info (p.19)** lists "product name, firmware version, **device mode (pro/light)**, T-Link support ready (for pedals controller)".

### 1.7 Axes combining (§3.5, p.36)

> "Axes combining allows to «rotate» one axis using another one. There is a difference between this kind of axis control and using button … or encoder … as axis trimmer. Using buttons or encoders you **must not create an axis** to change response of existing one. When you combine axes you **must have forcing axis, physical or virtual.**"

Parameters (Table 3.2 §3.3): `Combine` (mode), `#Axis` ("Number of the axis that forces on current one"), `%` ("Maximum combining effect"), `Sign` (+ / –).

> **§3.5.2:** "This value determines trimmed axis center shift if forcing axis will be moved to its extreme position. **50% moves center to range limit. It is recommended to use 20–25%.**"

**Modes (Table 3.2 `Combine` + §3.5.3–3.5.4):**
| Mode | Behaviour | Ref |
|---|---|---|
| `Combi1` | Plain center shift by forcing axis, up to `%` | §3.5.2 p.36 |
| `Dir1`, `Dir2` | "allow to align centers of two combined axes… differ by response sign (shift direction)" | §3.5.3 p.37 |
| `BrakeV` | Toe brakes. Button closes both virtual brakes; moving rudder **releases** the corresponding brake if rudder response exceeds `%` | §3.5.4 p.37 |
| `BrakeV1` | Differential: brake engages when rudder exceeds `%`, then moves *with* the rudder; released on rudder idle | §3.5.4 p.38 |
| `BrakeV2` | "similar to BrakeV. But on brake axis moving both virtual virtual brake axes will be engaged **with dead zone**" | §3.5.4 p.39 |
| `BrakeV3` | Rudder exceeding `%` causes the corresponding brake to **decrease proportionally** rather than release | §3.5.4 p.39 |
| `Average` | Weighted blend: "Axis 2 (response)=0. Axis1 maximum = 30%. Axis 2 moves to maximum, engaging Axis 1… Axis 1 can move to minimum for 30% only." | §3.5.4 p.39 |

There is **no explicit equation** for any of these — the manual gives only graphs (Figs. 3.10–3.14) and prose. A reimplementation must derive the transfer functions from the device.

### 1.8 Relative axes (§3.4, p.35)

> "Response of common absolute axes corresponds to grip position… It is reasonable to use **relative axes for ministicks.** The rules: Grip move direction determines response direction; Grip deviation value determines response speed."

> "When you release grip it returns to the center automatically under the force of springs, **but response remains in the last point.** You must use separate control unit (RARst button, see 4.3.23 on p. 95) to reset axis instantly or move grip to opposite side."

Parameters: `Mode` (Abs/Rel), `RMpl` (Relative mode multiplier), `TCurve` (Lin / Sqr), `FL` ("Forced limit. «WEP limit switch». For relative axis mode."), plus global `FL Mode` (Static / Dynamic / Double tap) and `FL Speed`.

**§3.4.2 Forced limit:** "If FL is checked, than when you quickly move the grip to its limit response value instantly will be set to maximum… **Static mode**… ignores stick movement velocity… If **Dynamic** mode selected… If FL Speed = 0 FL works as in Static mode. If FL Speed > 0 instant jump to maximum occurs on quick stick movement… **Double tap** mode."

This is effectively **motion-profiled velocity integration** — a mini motion engine in firmware.

### 1.9 Response curves / equalizer (§3.6, p.40)

> "Use control items of Response curve tab to customize axes response curves. **You can create eight different curves and apply them to any axes.**"

- Editor: `Linked` (link sliders), `Proportional`, `Square` ("middle slider enabled for moving. The rest will move after it, forming smooth curve"), `Cubic (Bezier)`, `Show Values EQ`, `Reset curve`, `Reset 2 original`.
- **Eight named curves — never enumerated in the text.** They are only visible in the (missing) figures. The fallback rule is in **§4.3.20 (p.88)**: "If empty value of `Eq N` combo box will be assigned for axis … than curve with number, corresponding to axis number will be applied."
- Permanent vs temporary: **§3.6:** "To permanently apply customized curve to an axis check Eq for it and select curve number. To apply curve temporary use button with **CrV** function (see 4.3.20)."

**Note: no curve point coordinates, no curve data format, no normalisation definition is given anywhere.** This is a hard blocker for byte-exact reimplementation (see §7).

### 1.10 Axes2Buttons (§3.7 p.42, §7.17 p.131)

Two separate implementations with overlapping-but-different names and off-by-one semantics — see §7.

**Common idea (§3.7.1):** "The whole axis response range is divided to some zones. Every zone will have corresponding button. When it comes to one of the zones, corresponding button will be virtually pressed."

**§3.7.1 Type:** `OFF`, `Edges1` ("single button press on bound zone cross"), `Edges2` ("pair of buttons from both sides of zone bound will be pressed with bound cross"), `Zones` ("button is pressed while axis response belongs to the zone").

**§7.17 Type:** `Edge 1` ("single button N=VBbut1 press on bound zone cross on axis response **ascending**. Single button N=VBbut1+1 press on bound zone cross on axis response **descending**. If N Pos = 5, there will be registered **4 pulses**"), `Edge 2` ("buttons from VBbut1 to VBbut1+N Pos-1 will be pressed on zone edges"), `Zone` ("buttons from VBbut1 to VBbut1+N Pos will be pressed while axis response belongs to the zone").

Parameters: `Num`/`N Pos` (zone count, 0/1 = trailers), `Hysteresis` (% of full response range), `Vbut1`/`VBbut1` (first button number).

> **§3.7.1:** "Set zone number using counter Num. **0 an 1 allow to use trailers.** Button will be pressed at extreme axis positions. If Num = 0, lower trailer will work, if Num = 1, than upper."

### 1.11 Physical button functions (§4.2, p.48–49) — full list

The manual's own list (verbatim, with its errors preserved — see §7):

```
Button – simple button
Button alternative – button with fixation
Radiobutton – button one of group
ButtonS – button under control of subshifts #1…6
ButtonX – button under control of subshift #7
ButtonD – button under control of subshift #7          [sic — see §4.3.6]
ButtonM – button under control of Modal Switch
Shift – button modifier
SubShift – subshift, additional button modifier
Toggle – toggle switch
Encoder – encoder
Cyclic Switch – cyclic switch
POV switch – HAT switch
uStick switch – POV mode switch
uPov switch – POV mode switch
Switch CB – POV mode switch                            [sic — see §4.3.16]
Generator – generator
Tempo – several-function button; output depends of pressing time and type
Trimmer – axis trimmer
Curves – dynamic axis response curve switch
Fix_Axes – axes modifier
AuxAxes – axes mapping
RelAxes – relative axis mode control
DZ switch – expulsion button from the processing
RPB – button replicator
Sync – toggle synchronizer
NoF – no function
```

### 1.12 Modifier model — Shift / SubShift / Modal Switch

This is the most sophisticated and least-understood part of the model. It is a **layered modifier hierarchy**, implemented in firmware.

**Global Shifts (§4.3.8, p.59):**
> "Controller can process up to **two shifts**, so one input line can have three output ones. **Shift0** allows output signal if no other Shift (1 or 2) is pressed."
> Modes: **Momentary** (analog to Shift), **Alternate** ("with holding, analog to CapsLock"), **Cyclic** ("cyclic").
> "In Cyclic mode every button press changes modifier type (Shift 1 and Shift 2)."

`Track as button` (§4.3.8): "allows to use button with Shift function as simple button too."

> **§4.3.8 hard warning:** "**DO NOT map Shift0 button to keystroke!** It will work if no Shift1 or Shift2 are pressed that is practically permanent. Simple button even depressed generates continues but single output signal. Keystrokes will repeat thus flood system keyboard buffer. **In this case you must disconnect joystick.**"

**SubShifts (§4.3.9, p.61):** 7 instances ("Maximum subshift number is equal to seven"), modes Momentary/Alternate. Can be Shift-dependent: "Select button mode from combo box for every Shif1 (0...2)."

**Consumers of modifiers** (this is the "who listens to what" graph a new UI must render):
- `ButtonS` — controlled by SubShift #1…6 (§4.3.4)
- `ButtonX` — controlled by SubShift #7 (§4.3.5)
- `ButtonM` — controlled by Modal Switch (§4.3.7)
- `Use Shift 1` / `Use Shift 2` checkboxes on simple functions (§4.2.1: "You can use two independent modifiers Shift 1 and Shift 2")
- Encoder lines: "Encoder lines can be modified … with Shift1 or Modal Switch1 or Modal Switch2 modifiers" (§4.3.11)
- LED events SHIFT/SubSHIFT (Table 11.2)
- Boolean trigger inputs `Shift`, `sShift` (Table 7.1) and outputs `Shift`, `sShift` (Table 7.2)

**ButtonX's output-number arithmetic is the clearest example of the "magic numbering" problem** (Table 4.1, §4.3.5 p.57):

| | SHIFT1 Off | SHIFT1 On |
|---|---|---|
| **SubSHIFT Off** | 5 | 2 |
| **SubSHIFT On** | 1 | 3 |

**§4.3.5:** "The number of output line depends on combination of global Shift modifier and Sub Shift local modifier… output line number will correspond to physical one… If you press button depressing SubSHIFT 7, output line number will be equal to counter `subShift Button` value… If this button is controlled by global Shift … then output line numbers will depend of Shift 1 и SubSHIFT 7 states and **by default will go after line number assigned in subShift Button counter.**"

There is **no formula** — just the 2×2 example table.

**Modal Switch (§7.16, p.128–131)** — V2.18's newest construct:
> "Modal switch is a control modifier. It is reasonable to use it as rotary switch – multiShift."
> Setup: `Layer` (input), index, **`N Pos`** (= number of rotary modes), and a **unique index 1…4** ("Every Modal Switch has unique index from 1 to 4").
> §7.16.2 Shift: "**Button M output line index with Shift is equal its number + N Pos value.** Shift using allows to double output lines number."
> §7.16.3 Null position: "**Neutral Position** checkbox allows to shift output lines by one position."

### 1.13 State / timing primitives

The whole "temporal logic" layer, all in firmware:

| Construct | § | Semantics |
|---|---|---|
| **Toggle** | 4.3.10 | "When you close control with Toggle function a **short pulse** will be generated **even if the line stays closed.** Pulse length… Time of toggle pulse global parameter." Optional 2nd line on open. Max 64. "Shift1 and Shift 2 modifiers do not affect toggle switches." |
| **ButAlt** | 4.3.2 | Latching button; optional `Pulse` mode (behaves as Toggle); default state; `Sync`-able. "Shift function not allowed." |
| **RadioButton** | 4.3.3 | Exclusive group; `Group` counter (auto-created); `Master` (auto-pressed at joystick start). "If there are several master buttons in a group, only last assigned will be work as master." |
| **Cyclic Switch** | 4.3.12 | Each press selects the next line in a sequence: "2 3 4 3 2" with `Reversible`. |
| **Tempo 1/2** | 4.3.18 | Two-stage: short press → line 1 (pulse = `T_Tgl`); long press (> `Tempo Time`) → line 2 (pulse = `T_Tgl` for Tempo 1, = press duration for Tempo 2). |
| **Tempo 3 / 3s / 3A** | 4.3.18 | 3-position; `3s` associates a Shift with each mode; `3A` = "Static 3-position switch… One of lines is «pressed» permanently." |
| **Generator G1/G8/GT/GT+/GTE/GTE+/GTR/GTR2** | 4.3.17 | 8 pulse generators. `Value` 1…127 × 0.01 s, ×10 multiplier. **GT vs GTE:** "**GT generators are independent. One generated pulse can not be interrupted… GTE pulse can be interrupted by another one!**" `GTR` = second press interrupts; `GTR2` = double-pulse ("The second press generates the second pulse of pair before period ends"). |
| **SwitchCB** | 4.3.16 | "Several CONSEQUENT lines included into a group. **Complementary button is pressed if all other buttons of the group are released.**" `N` + `Compl.BUT` ("It is the first line of the group"). If N = 1 → "button with additional inversed output". |
| **ButtonD** | 4.3.6 | Dependent button: auto-released when master pressed; `Master Button`, `Press` delay, `Release (Master)` delay. Example: "If 2nd trigger is pressed within **40 ms** then 1st trigger will not be registered… If 1st trigger will be released within **80 ms** than it will not be registered." |
| **Sync** | 4.3.26 | Polls all Toggles + pulse-mode ButAlts; subfunctions `Synchronization` and `SET`; `Toggles`, `BA`, `ALL`. |
| **RPB** | 4.3.25 | Replicates a physical button onto another line ("line-replica can use logical functions"). |
| **uStick / uPOV** | 4.3.15, 4.3.14 | Switch which POV is active / HAT↔axes for a ministick. Modes in Tables 4.2 and 4.3. Constraint: "**On uPOV use uStick MUST be disabled. No one button with this function.**" |

### 1.14 Axis modifiers (physical-layer functions that write to axes)

**§4.3.21 Fix Axes (p.89):** "Axis modifiers allow to set specified axis response value."

| Fn | Behaviour |
|---|---|
| **FA0** | "set current axis position as its center («helicopter trimmer»)" — 4 modes M1–M4 (Table 4.4) differing in release/centering/long-press-freeze/reset semantics, gated by `Rls Time`. |
| **FA1** | Fix no-center axis at 0, with-center axis at centre. |
| **FA2** | Freeze at current position. |
| **FA3** | Set to `FA3 val.` (Table 3.2, "% of whole response range"). |
| **DR** | Scale response by `D.Rate` after `TimeDR` ms — "when you aim the target". |

"FA2, FA3, DR modifiers have **alternate action**. If it is checked modifier works as a trigger." Transitions are ramped: "**FA0, FA1, FA2, FA3 variables (ms) – specify transition time… (modifications are applied to axis response not immediately).**"

**§4.3.22 AUX Axes (p.92–94):**
- **SWAP** — "rotate physical axis (source) but get response of another one (target)… Source axis response… will be equal to zero for axis without center or goes to the center for axis with it." `Num` = pairs, ordered.
- **REMAP** — "rotate several axes linked with source axis"; targets become slaves of source.
- **SWITCH** — "If button … pressed target axis is disabled. Response of this axis will appear if source axis will be rotated."
- **SWITCH 0** — "target axis is **zeroed** and disabled."
- **PAI INV** — inverts axes `Source … Source+Num-1`.
- **SPLIT Rev** — "Splits axis to two semiaxes symmetrically to center."

**§4.3.23 RelAxes (p.95):** `RESET`, `SET FA3 Val.` ("set selected axes response value equal to FA3 val parameter"), `SET Value 2` (per-axis `%` counters).

**§4.3.24 DZ Switch (p.96):** "Button press disables deadzone of selected axes."

**§4.3.19 Trimmer (p.84):** `Trimmer Reset` / `Trimmer Return` (store/restore, `Trimmer Time` = 0 → instant), `Trimmer+`/`Trimmer–`, `Trimmer Auto+`/`Auto–`, `Trimmer SET+`/`SET–`. "Choose trimmed axis number from Axis combo box. **If there exists an axis with specified number it will be trimmed. If an axis does not exist it will be created.**" → implicit virtual-axis creation. Global `Trimmer Time/Rate/Mix./Auto Rate` (Table 2.1) and per-axis `Trimmer` enable (Trim+/Trim–/Input) + `Mode` (Standard/Modified).

### 1.15 Boolean / logic constructs (Ch.7)

> **§7.1 (p.118):** "Allow to control virtual button press using other buttons state… Boolean functions **can be connected to chains** thus generating logical sequences."

**Input source types** (§7.1, Fig 7.2 — figure missing): "physical button press, logical or virtual – the result of logical functions, Shift modifiers and so on." Parameters: `But N` index, `Inv`.

**Boolean functions (§7.2–7.6):** `NOT`, `2AND`, `2OR`, `2XOR`, `3 AND`, `3 OR`, `3 XOR`. Each: "Check **Hub** to register several output (**up to 4**) lines." (V2.17 addition, §1.2.9.)

**Triggers (§7.7, p.121):** "Trigger is an element that has two stable states that can store state information."

| Type | § | Semantics |
|---|---|---|
| **RS** | 7.8 | Set/Reset latch. |
| **RT** | 7.9 | "Input T toggles these states with every press **IF input R is OFF.** If R is ON, then output stays unchanged regardless to T state." |
| **RST** | 7.10 | Combination of RS + RT. |
| **JK** | 7.11 | "Input C toggles these states with every press **IF inputs J AND K are ON.** If J is ON, then with C ON output becomes ON. If K is ON, then with C ON output becomes OFF." |
| **D** | 7.12 | "If D is ON, then C toggles output to ON. If D is OFF, then C toggles output to OFF. R toggles output to OFF." (This is a **JK with J/K combined into one D input** — undocumented equivalence.) |

**Trigger I/O (Tables 7.1 / 7.2, p.122):**

| Direction | Values |
|---|---|
| **Trigger inputs** | `Physical`, `Logical`, `Virtual`, `B-alt`, `Shift`, `sShift`, `Boolean` ("Boolean function output state"), `LED event` ("LED event state") |
| **Trigger outputs** | `Physical`, `Virtual`, `Shift`, `sShift`, `Free` ("Free event — Can be used as LED event") |

**Trigger options:** "Inversion checkbox inverts parameter value… **Dynamic checkbox controls parameter type: edge-triggered, level-triggered.**" + `Hub`.

**Comparators (§7.14 / §7.15) — the detent constructs:**
> "**Single treshold comparator. Enables output if axis responce is greater than specified value.** Select axis type from `Layer` combobox and its index (`Input` counter). **It is recomended to use Virtual or Logical axis type.** For Physical or Virtual types, which have center `Inv` checkbox allows to select response direction. **For Logical type this parameter is ignored.** Set treshold value in percents of full response range. **Hysteresis (in percents) is an optional parameter.**"

> "**Dual-treshold comparator.** Enables output if axis responce is greater than first treshold value **and less than second one. Second treshold (44% at example) must be greater than first (22%).**"

So comparators are (layer, index, direction, lo, hi, hysteresis) → boolean output. Note they output to a **boolean/line**, not to a detent in an axis curve — there is no per-axis detent array in this device.

**M counter (§7.13, p.125):** "C is a count input. Output is registered after **Num-1** C events. If Num=6, **every 5th** physical button 34 press will cause virtual press of line 36… R input resets press sequence… ± input reverses counter… This description refers to **Single** mode. If you select **Multi** mode then every button 34 will consequently and cyclically press virtual buttons from VButtN to VButtN+Num. 61→62→63→64→65→66→36."

### 1.16 HAT / POV (§6, p.114)

> "Joystick can have up to four HATs. Physically discrete HAT is four-position switch… **HAT uses four lines.** Analogue HAT is two-axes ministick… Using NJoy32 controller you can configure **POV#1 and POV#2 as analogue as well as discrete HATs. POV#3 and POV#4 can be configured as discrete devices only.**"

**Table 6.1 — `POV Type`:** `Discrete`, `LoRes 4W`, `LoRes 8W`, `HiResPOV` ("Not used in games at present time"), `Shifter 6W` ("6-position shifter. Virtual gear box.").

**Table 6.2 — `Output`:** `POV`, `Buttons V` (Logical buttons set), `Buttons L` (Virtual buttons set), `Numpad`, `Mouse Rel`, `Mouse Abs`.

- **§6.3.2:** "Assign first button number of this set using `But#1` counter… Other buttons will have next numbers. `@once` checkbox allows to use diagonal ministick pressing."
- **§6.3.3 Numpad:** "When ministick is in the center **Numpad5** key can automatically be pressed… By default **NoFunction** logical function is assigned to Numpad5… Check **C, S, A, W** to add modifiers Ctrl, Shift, Alt, Win left (row L) or right (row R)."
- **§6.4 Table 6.3 (Ministick axes binding):** `VC#`, `2D`, `X`, `Y`, `Inv`, `DZ` ("Specifies button pressing treshold for LoRes 8W or LoRes 4W modes **or deadzone for HiResPOV**"), `Active` (Always / On-Off). "You can bind ministick to **ANY joystick axes** similarly to virtual mouse… If you want to know what physical axes numbers uses ministick in fact, **open Test tab, move ministick and see its response.**"

### 1.17 Virtual keyboard / mouse (logical functions)

**§5.5 Keyboard (p.106–107):** "You can assign single keystroke to button **pressing physical key** or choose it from combo box… Chosen keystroke will appear in combo box, **In addition you will see its scancode.**" Modifiers: "Ctrl, Alt, Shift, Win. **Right and left modifiers are distinct.**… Simultaneously modifiers use (RCtrl+RShift+A) is allowed."

**§5.5.2 warning:** "**When you work with keystroke mapping note that any key press will affect this function. Use mouse only to control process** unless you really assign keystroke." (i.e. the capture widget is global — a hook-based key sniffer.)

**§2.4.10 (p.28):** "**Dly** parameter (milliseconds), resolves" the Battle of Stalingrad modifier-ordering bug. "**Value of 30 ms is recommended.** Larger value can cause errors if you will press button with short intervals." Also `F13…F24` checkboxes, `Multimedia` and `System` checkboxes. Global `Eco` (§2.3.1) "Allows to control virtual keyboard connection time."

**§2.4.11 / §5.6 Virtual mouse (p.28, p.108):**
- `Mouse`: **Off / Relative / Absolute / R+A** ("Relative + Absolute… You can move cursor to predefined screen point pressing button with assigned **Set Center Point** function").
- `Active`: **On/Off / Always On**.
- `SCREEN` group: `Width`, `Height` (pixels) for Absolute and R+A.
- `SP1…SP7` groups: `X`, `Y`. *(§2.4.11 first says "Use X and Y fields in **SP1...SP8** groups"; four lines later "up to 7 screen positions… **SP1 ... SP7**". Contradiction.)*
- `Delay` (auto-acceleration delay), `Speed` (counter; zero ⇒ auto-acceleration), `Curve` ("custom response curve … applied to mouse axes", V2.18).
- **§5.6.3:** "Wheel item allows to control mouse axis using button… Assign direction – Up or Down and velocity multiplier. **If multiplier is equal to zero, cursor autoacceleration will be used.**"
- **§2.4.11 warning:** "Be careful using virtual mouse always turned on… even small axis jitter… will cause spontaneous mouse cursor move."

### 1.18 Macros (Ch.8)

> **§8.1 (p.133):** "Macro can be described as a **named sequence of logical button actions** i.e. simple button press, keystrokes and so on. Each action or macro element is named as **point**. **By default macro consists of four points.** You can concatenate several macros to increase points total. Each single macro can have specific timing – **whole point duration and a part of this time in which virtual button stays pressed.**"

- **§8.2.1:** "Each macro has its own index – **up to 118**. Index of the macro is its name."
- **§8.2.2:** each point is a **logical button function** (i.e. macros embed the whole Ch.5 function set). `Void` = delay point: "Set delay value in `Delay` field in milliseconds. **Value will be multiplied by 10.** Check `x10` to multiply by 10 one more time. **If Delay=0 than pause will determined by common timing parameters Press and Release.**"
- **§8.2.2 Continued macro:** "Check `Continued macro` to append next macro to current one. You can append not only next macro but one with specific number."
- **§8.3 Macro timing:** "**Eight time sets** can be used. Set point press duration time (**1... 1250 ms**) in `Press` field. Set release duration time in `Release` field. You can assign time set to a macro using `Set` counter."
- **§8.5–8.8:** group ops — `Service` group with `Clear all`, `Clear Array1` (Begin/End), `Macros Array1` Begin/End + column checkboxes + `Fill array1`, `Macros Array 2`, `Copy 1 to 2`.
- **§5.7.2:** "Set macro number using counter. If you want to automatically repeat macro if its button stays pressed at macro end check `Repeat`… You MUST set macro parameters and SAVE it on Macro tab BEFORE Macro function assigning to a button."

### 1.19 LEDs / indication (Ch.11) — an event-driven subsystem

This is a **priority-resolved event bus**, not a per-LED script.

**§11.1.2 (p.143):** standard LEDs (base/grip; "Mamba series joystick case has six LEDs, Gladiator has two. **GNX modules use up to 32 LEDs.**"), plus WS2812 RGB strips/panels/matrices on SPI2. LED driver type (Table 11.1): `WS2812B = 000`, `WS2812D = 100`, `APA106 = 001`. Wiring: "4 – VCC +5V, 6 – MOSI, 8 – ground." "NJOY32 can control up to **80** LEDs with external power supply."

**Table 11.2 — event flags:** External (no indication), Zero event, SHIFT, SubSHIFT, Fix Axis, Calibration, Physical Button, Virtual Button, Logical Button, Axis in center, MaRS fault, Calibration fault, Rudder connect, BUS error, POV active, Mice active, Profile N, Cyclic Switch, B-Alternate Function, V-Alternate Function, Boolean function.

**Table 11.3 — per-event `OP1` parameter:** SHIFT 0/1/2 ⇒ Shift 1/2/0; SubSHIFT ⇒ number; MaRS fault ⇒ 1…8; Axis in center ⇒ 1…8; *Button ⇒ line number*; POV active ⇒ index; Cyclic Switch ⇒ index + position; BUS Error ⇒ BUS device index.

**§11.2 resolution rule (critical semantics):**
> "Check `Ext.` to transmit LED state via network. Set LED index for this event in `LED#` field. **Single system LED has number 0.** You can assign the same LED to indicate different events. In this case use different light parameters i.e. color, brightness, frequency. **If some events assigned to single LED will occur simultaneously will be indicated event with greater number.**"

→ **LED conflicts are resolved by numeric event ID.** Nothing documents the IDs.

**LED params:** `Invert`; `Alternative Color` C1/C2/C3 ("Alternative color is used to indicate that its event NOT occurs"); `LED Mode` = Off / Constantly / Slow Blink / Fast Blink / UltraFast / Flash; `Color Mode` = Color1 / Color2 / Color1/2 / Color2/1 / Color1+2 / Color1+ / Color2+.

**§11.3 LED Gauge (p.149):** up to four axes; `Axis N`, `Num` (odd count recommended for centered axis), `Axis` (Normal/Virtual), `Type` (Table 11.4: **UFC** Unipolar Full Scale, **U±** Unipolar combined, **CFS** Centered Full Scale), `R` (Reverse order), `Base` (first LED), `Center, %`, `Overlimit`, colours Upward/Downward/Center.

**§2.3.1 (Table 2.1):** `Cal` checkbox also drives the LED: "Lightning mode of LED indicator will be changed (See 11 on p. 143), if you have made this setting" (§3.8.1).

---

## 2. HOW STATE IS STORED AND PERSISTED

### 2.1 The `.cfg` profile file

> **§9.3 Saving profile (p.138):** "You can save current profile, **i.e. parameter set to file.** To do so press `Save` button and choose folder and enter file name. **By default file will have cfg extension.**"

> **§9.4.1 (p.138):** "Saved profile can be loaded into controller memory. Press `Load` button, open folder containing profile and choose file with `cfg` extension."

> **§9.4.2 (p.138):** "Using VKBDevCfg.exe **starting with 0.85.06 version** you can use drag'n'drop to load profile from file. Simply drag file name from windows explorer to configurator window and drop it. **If `Set After Load` on `Settings tab` is checked then parameters will be saved to controller memory automatically.** Otherwise you must press `Set` button as usual."

**That is the entire documentation of the persistence format.** No structure, no encoding, no field list, no size, no endianness, no checksum, no version field description — I grepped the whole document for `byte|binary|serializ|structure of|file format|format of|header|checksum|endiann|compress` and the **only** hit is "MPL … Binary multiplier for sensor response normalization" (Table 3.1). **The `.cfg` format is completely undocumented.**

Profiles **do** carry a version: **§9.1.1 (p.137):** "Profiles i.e. parameter sets also must correspond to firmware version." And **§2.2 (p.20):** "**Some versions of firmware reset controller parameters to default values.**" Example filenames in Table 2.2 embed the firmware version: `Mamba_1556_BoS.cfg`, `Mamba_1556_BoB.cfg`, `Mamba_1556_Il2.cfg` (so "1556" is presumably a fw ID, likely 0x15 0x56 or similar — never explained).

### 2.2 `.mcr` macro file

> **§8.4 Operations with macro (p.135):** "After you have completed macro setup press `Set` button in `Device` group to load current parameters to controller. `Get` button allows to read parameters from controller. **`Save` button allows to save current macro parameters to file with `mcr` extension.** `Load` button allows to read parameters from file. Do not forget to press `Set` button to load parameters to controller!"

> **§5.7.1 (p.109):** "Macro is a **named keystroke combination saved in a file** that can be called by single button press."

Again: file exists, format undocumented. Note macros are also **resident on the device** (118 of them) — so `.mcr` is an export/import of on-device state, not a script the device reads at runtime.

### 2.3 Device read/write — the `Get` / `Set` protocol

This is the core persistence boundary, and it is *the* thing any external tool would have to speak.

> **§9.1 (p.137):** "**You must press Set button to load current parameters into controller memory and apply them.**"

> **§9.2 (p.138):** "`Get` button allows to retrieve current controller parameters. **No matter what tabs of configuration tool are open. The whole parameter set will be retrieved.** If you have made some parameter changes and then decided not to load them to controller you can simply press Get button. **It is possible only if you have not pressed Set button before.**"

(That last sentence implies the device holds only **one** live configuration — there is no multi-slot store on the device.)

> **§2.4.6 (p.26):** "Every time you have changed controller parameters you must save new settings in its memory. **On some computers sequential parameter saving causes error.** … This error is a result of specific interaction between Windows and USB devices. If you have such troubles try to set nonzero value in `SD (Delay of Start Controller)` field."

→ **`Set` appears to be a slow, multi-packet USB operation** that needs pacing. Highly relevant to any reimplementation.

**§9.1.2 Partial parameter loading (p.137)** — the closest thing to a granular write API:
> "Add `PartialWrite=1` string to `[User]` section of zconfig.ini file and you will be able to **load parameter set partially.** For example you want to reassign button mapping only. After you press `Set` button **Partial write settings dialog will appear.** Check parameter names that will be loaded to controller. `Set all` and `Clear all` buttons allow corresponding choices. Press Set button to complete loading. Cancel button allows to cancel loading."

→ **There is a named, enumerable list of writeable "parameter" groups**, shown in a dialog (Fig. 9.2 — image missing). The group names are the closest thing the manual gives to a top-level schema, but they are **not enumerated in the text**.

### 2.4 `zconfig.ini` — the ONLY documented machine-readable file

> **Appendix I (p.163) Overview:** "When you launch configuration utility for the first time **configuration file zconfig.ini will automatically be created** in the same folder with VKBDevCfg.exe file. It contains **miscellaneous utility parameters**. **Some of them MUST be appended by user be-cause of they are not created automatically.**"

**Table 12.6 (verbatim, complete):**

| Section | Parameter | Description |
|---|---|---|
| `[Common]` | `Use matrix=1` | Allows `Row`, `Col`, `Base` fields on Global – External tab. |
| `[Common]` | `PageControlTop=1/0` | Tab positions on top/bottom. |
| `[Common]` | `SwapPL=1` | Axes panels position. Physical axes panel is on top. |
| `[Common]` | `Release_DI=1` | Buttons and axes testing is enabled after parameters activation. "In case of some problems set Release_DI=0" |
| `[User]` | `ForcedWriteID=1` | "Enables to load profiles created for firmware versions that are not current." |
| `[User]` | `User=Developer` | "**Enables Macro, LEDs, virtual mouse using.**" |
| `[Common]` | `Test Misc Enabled=1` | Enables MARS sensors and LEDs testing. |

**INI parameters used in the body but MISSING from Table 12.6:**
- `PartialCalibration=1` — §3.8.1 (p.45): "If zconfig.ini file contains PartialCalibration=1 string, you will see Partial Calibration Settings dialog"
- `PartialWrite=1` — §9.1.2 (p.137)
- `Profile N= <name>` — §2.4.8 (p.26), arbitrary count:
  > "Add the following lines to `[User]` section of Zconfig.ini configuration file … `[User]` / `Profile 1= Fat Mamba profile for BoS` / `Profile 2= …` / `Profile 3= …` To see profile name **enter its ID into `Profile ID` field.**"

**INI parameters in Table 12.6 never explained in the body:** `Use matrix`, `PageControlTop`, `SwapPL`, `Release_DI`, `User=Developer`.

`User=Developer` is a **feature gate** — Macros, LEDs and virtual mouse are hidden for normal users. Any new UI should know this is a one-line unlock.

### 2.5 Clipboard — the only documented programmatic interop

> **§4.2.1 (p.50):** "**`Copy cell` button allows to copy current line parameter set to clipboard. `Paste cell` button allows to apply parameter set from clipboard to current line.**"

> **§1.2.4 V.2.10 (p.16):** "Using clipboard for physical lines setting (see Line (input control) choice on p. 50)."

> **§8.8 Using clipboard (p.136):** "`Copy 1 to 2` allows to copy specified macro range to clipboard … and paste this macros from macro number specified in `Macros Array 2` field. **Current macro assignments will be lost.**"

→ **This is the single most valuable undocumented-ish surface for a companion tool.** A full physical-line parameter set can be copied to the Windows clipboard and pasted into another line. If the clipboard format is a plain-text/serialised record, a third-party UI could in principle synthesise line configurations and inject them via `Ctrl+V` into the wizard dialog — without knowing the USB protocol at all. **This should be the first thing to reverse-engineer.**

### 2.6 Reports / export

> **§9.5 Button assignments report (p.138):** "You can create list of joystick controls assignment **Fast Report format.** Press `Device Report` button. Print Preview window will appear… **Physical and logical layer joystick controls assignments are shown in this window. Hover line number to see its assignments.** Callout with needed data will appear."

→ VKB use **FastReport** (a Delphi/VCL reporting component). "Fast Report format" implies an `.fr3` template and/or a PDF/HTML export path. **The manual never says what formats can be exported.** Worth probing: if `Device Report` can export text/PDF, a new UI could use the vendor tool as a *reader*.

### 2.7 Automation / scripting / command line — **NOTHING**

Exhaustive negative result. Searching the whole document for `command line|commandline|batch|script|automation|argv` finds **zero** relevant hits. Specifically absent:

- No command-line arguments to `VKBDevCfgC.exe` (§1: "It does not need to be installed. To launch configurator you must just execute this file.")
- No scripting language
- No IPC, named pipe, socket, or shared-memory API
- No registry / COM / OLE automation
- No documented HID/vendor-feature-page transport

The **only** external-process interactions mentioned are sibling executables shipped alongside:
- `ZBootloader.exe` (firmware flasher, §2.2.1, §2.2.2)
- `ZLink2` / "Z-Link" (virtual-BUS pairing over USB, §12.6)
- `VKB_JoyTester.exe` (external tester, §3.8.2, downloaded from `http://ftp.vkb-sim.pro/Programms/VKB_JoyTester.zip`)
- `USBdeview.exe` (third-party, cited in §2.4.12 as the way to verify PID)

### 2.8 Z-Link2 (§12.6) — a hint at a real control channel

> **§12.3 (p.155):** "Check `Virtual BUS over USB` to use Z-Link2 (see section 12.6) instead of cable connection."

> **§12.6.2 (p.161):** "Select slave controller … open `Global – External` tab. Set `AdrH` и `AdrL` values taken from Z-Link, 34 and 52… **Check `Virtual BUS over USB`. Controller light will become green in Z-Link window, controller registered in the net.**"

> **§12.6.3 (p.162):** "If `Use global shifts for slave controller` … is checked and Master button, configured as Shift is pressed, **corresponding indicator of Zlink2 window flashes.**"

→ Z-Link2 **can see live shift state** on a device over USB. That is observational traffic over an undocumented protocol. It confirms a non-HID control channel exists between host and device. **If you are building anything external, this channel is the thing to reverse.**

---

## 3. GLOSSARY — THE VENDOR'S OWN VOCABULARY

### 3.1 Global controller parameters (Table 2.1, §2.3.1, p.24)

**Checkboxes:** `Cal` (calibrate status), `DF` (Dinamic [sic] Filter), `Map` (logical button mapping → logical or keyboard), `Hide` ("Hides current device"), `Eco` ("Allows to control virtual keyboard connection time"), `W105` *(undocumented — no description at all)*.

**Fields:**
| Name | Meaning |
|---|---|
| `Tempo Time` | Tempo function delay time (§4.3.18) |
| `T_Tgl` | Toggle pulse width, ms — **listed twice** in Table 2.1, once as "Time of toggle pulse", once as "Time of toggle switch pulse" |
| `Time FA0…Time FA3` | Axes fixation transition delay, ms |
| `TimeDR` | Double rate / fixed-rate axis-response-reduce delay, ms |
| `D.Rate` | Axis response reduction rate list |
| `T_Enc` | Encoder pulse width, ms. "recommended… between 10 and 50 ms. If you use internal button mapper, set 10–20 ms. For external mappers use value not less than 20 ms." (§4.3.11 says "not less then 15 ms" — **conflict**) |
| `T_Gen` | Generator pulse width/frequency, ms |
| `Trimmer Time` | Trimmer reset duration, ms (0 = instant) |
| `Trimmer Time / Rate` | Trimming rate |
| `Trimmer Mix.` | Trimming curve: S-shaped or linear |
| `Trimmer Auto Rate` | "TrAuto+/TrAuto– function fall and rise rate. **1:X values accelerate fall, X:1 ones slow down**" |

### 3.2 Additional/global parameters (§2.4, p.25–29)

`#POV` (hat count, 0–4), `#But` (max button number, ≤128), `FPS` (USB polling sampling rate, "Hz" mangled to "Gz"), `AClTime` (auto-calibration time; "**Always**" = permanent), `FA0 mode` + `Rls Time`, `D.Rate` + `TimeDR`, `SD` (Delay of Start Controller), `VC` (virtual HID controller count), `Profile ID`, `Map`, keyboard `Mode` (Off/Classic/Modified), `Dly`, `F13…F24`, `Multimedia`, `System`, mouse `Mouse` (Off/Relative/Absolute/R+A), `Active` (On/Off, Always On), `Curve`, `SCREEN Width/Height`, `SP1…SP7 X/Y`, `Delay`, `Speed`, `USB PID group` + bias, `SPI1/SPI2 port mode` (`OFF` / `S-but` / `S-Led`) + `RegN`.

### 3.3 Physical axis parameters (Table 3.1, §3.2.1, p.30–32)

| Control item | Expansion | Meaning / defaults |
|---|---|---|
| `ACn` | AutoCentering | "Axis center is detected automatically with every controller start." |
| `ACl` | AutoCalibration | "Must be checked to allow user to calibrate it" |
| `R` | Reverse | Physical data inversion |
| `Dir` | Direction | "Controls **normal MaRS rotation direction.** Is used to calibrate axis without center with angle range less than <175°" |
| `Eq N` | — | Response curve selection |
| `Eq` | Equalizer | "Enables response curve adjustment" |
| `Ext` | External | "Axis response can be transferred to external device… check Ext for it (Rx)" |
| `Trimmer` | — | "Variants **Trim+** и **Trim–** … Select **Input** for virtual axis that is controlled by buttons (Trim, TrimAuto) or encoders. This mode allows to control virtual mouse with this axis." |
| `Mode` | — | Trimming: **1 (Standard)** = centre shifts, range unchanged; **2 (Modified)** = both halves remapped so extremes stay reachable |
| `Input` | — | Sensor type: **D_MaRS / Analog / Virtual / A_MaRS / V_MaRS**. "**Wrong sensor type will cause axis malfunction!**" |
| `Filter` | Filter grade | "Default value for D_MaRS is equal to 5, for analog sensors – 6. **If filter value = 0 than Manual filtering is used instead of dynamic.**" |
| `Thr` | Threshold | 0–255. "Default … D_MaRS is 33, for analog – 55. **If Trh>0 than MF field value is used as upper dynamic filter value.**" (`MF` is never defined) |
| `HF` | HFilter | "Filter is named by **Hruks (newView author)**, dynamically moving filter… for tremor compensation" |
| `MPL` | Multiplier | "**Binary** multiplier… −15…+15. Default D_MaRS 9, analog 8." |
| `KdHi` | Coefficient of gain high | 0–255. "Default D_MaRS 190, analog 255." Manual cal. recommends **100–180** |
| `KdLo` | Coefficient of gain low | same |
| `Bias` | Bias zero point | "Specifies sensor initial position for automatic calibration… Is used for manual calibration." Manual cal. suggests **±100–150** |
| `Base` | Base quadrant | "D_MaRS sensor base quadrant… **Reference parameter.**" (never used elsewhere) |

### 3.4 Logical axis parameters (Table 3.2, §3.3, p.33–34)

`Name`, `En` (Enabled), `Vs` (Visible in HID), `In` (logical inversion), `Cn` (Axis with center — "MUST be checked for analog sensors"), `R`, `AxisID` (bound physical axis), `Mode` (Abs/Rel), `RMpl`, `TCurve`, `FL` (Forced limit, "«WEP limit switch»"), `Precis` ("Axis response digital capacity, bits"), `HID Usage` ("**It is NOT recommended to change default names. Wrong name can cause axis malfunction.**"), `Dz Lo`, `Dz Hi`, `Combine`, `Sign`, `#Axis`, `%`, `FA3 val.`.

### 3.5 Button-line addressing vocabulary (§4.2.1, p.50)

`Physical layer` group string (line number + register number + position), `Cancel`, `Next` / `Previous`, `Copy cell` / `Paste cell`, `Use Shift 1` / `Use Shift 2`, `Automapping`, `BUT1` / `BUT2`, `Use 2 buttons`, `2nd virtual button`, `Master Toggle`, `V. Button`, `Poll` (§4.2.2 "check Poll … if you press button … cell of its line will flash").

### 3.6 Virtual layer / logical function vocabulary (Table 5.1, §5.2.3, p.104)

`Button`, `HAT`, `Keyboard`, `Mice`, `Macro`, `Audio`, `Multimedia`, `Application`, `System`, `No Function`, `Void`.

- **§5.2.1:** "You can obtain access to logical function parameters from **Button mapping wizard dialog on Physical layer tab** or directly on **Logical layer tab**." Two editors, one model.
- **§5.12 / §5.13:** `No Function` — "No Function item allows to deactivate button." `Void` — "Delay in macro", macro-only (§8.2.2).
- "**Be careful to use System function. Improper use can cause operation system malfunction.**" (§5.2.3)

### 3.7 Boolean / trigger vocabulary (§7)

`Layer` (input type), `But N`, `Inv`, `Hub` (≤4 outputs), `Output`, `VBut N`, `Dynamic` (edge vs level), `Inversion`, `Input`, `Num`, `±`, `C`, `R`, `S`, `T`, `J`, `K`, `D`, `Single` / `Multi` (M counter), `N Pos` + index 1…4 + `Neutral Position` (Modal Switch).

### 3.8 Comparison axis-parameters vocabulary

`Dz Lo` / `Dz Hi` (logical, per-axis deadzones, §3.3) vs `DZ` (POV button threshold, Table 6.3) vs `DZ switch` (physical button fn that disables deadzone, §4.3.24) vs `Hysteresis` (Axes2Buttons, §3.7.1) vs `Hysteresis` (Comparator, §7.14). **Five different deadzone-ish concepts under five different names.**

### 3.9 UI surfaces named in the manual (for a UI-parity check)

- Top-level device list window (`VKBDeviceConfig`, §2.1)
- Tabs: `Info` (§2.1.1), `Global – Common` (Table 2.1), `Global – External` → `– LEDs`, `– External devices` (Ch.11, Ch.12), `Profile – Axes` → `– Physical Axes`, `– Logical Axes`, `– Response curve`, `– Axes2Buttons` (§3), `Profile – Buttons` → `– Physical layer`, `– Logical layer` (§4, §5), `Profile – POVs` (§6), `Profile – Boolean` (§7), `Profile – Macro` (§8), `Profile – LED Gauge` (§11.3), `Tools` (§2.2.1, §3.8.1), `Test` → `– Buttons/POVs`, `– Axes1`, `– External devices`, `– Misc` (§10), `Settings` (§9.4.2), `Action` (§3.8.2, §10.1.4)
- Dialogs: `Button mapping wizard`, `Button master wizard`, `Quick logical layer wizard`, `Curve wizard`, `Virtual layer`, `Partial write settings`, `Partial Calibration Settings`, `Print Preview`

---

## 4. FIRMWARE AND THE DEVICE

### 4.1 The tool is a bare, non-installed Win32 executable

> **§1 (p.15):** "VKB Njoy32 device configuration tool (configurator) is saved in **VKBDevCfgC.exe** file. **It does not need to be installed. To launch configurator you must just execute this file.**"

> **§1.1 (p.15):** "Configurator works under **Windows XP, Windows 7, Windows 10.**"

> **§1 (p.15):** supported hardware: Gunfighter SCG / MCG; Gladiator, Gladiator NXT, Gladiator NXT EVO; "FSM, THQ, SEM modules with GNX HID controller"; Mamba; KingCobra; pedals with TinyBox; ThrottleBox; BlackBox with any grips; Cobra-Z.

### 4.2 Firmware versioning is strict and enforced

> **§9.1.1 (p.137):** "**Versions of controller firmware and configuration tool must correspond. Otherwise some functions can malfunction.** Profiles i.e. parameter sets also must correspond to firmware version. In some cases it is better to reassign all axes and buttons all over again. **By default loading nonmatching profiles is forbidden.**"

Escape hatch: `ForcedWriteID=1` in `[User]` (§9.1.1 + Appendix I). "If profile does not match to firmware you will see warning message… You must confirm or cancel loading using message buttons."

> **§2.2 (p.20):** "**Some versions of firmware reset controller parameters to default values.** If you have made custom settings of controller parameters save you profile to file."

This means: **any reimplementation is pinned to a firmware generation.** The device must be reflashed to use a new tool. Profile filenames (`Mamba_1556_*.cfg`) suggest the version is embedded in the profile and is being matched — presumably an ID field.

### 4.3 The bootloader

> **§2.2 Firmware upgrade (p.20) / §2.2.1 Software activation:** 1. Connect controller. 2. Run VKBDevCfgC.exe, select joystick name. 3. **Press `Bootloader` button on Tools tab.** → "You will see firmware upgrade utility window." 4. **Press `Browse` and select firmware file** in a standard Windows dialog. 5. **Press `Flash It!`.** "After successful upgrade completion z-bootloader window will be closed automatically."

> **Direct launch Z-Bootloader (p.21):** "Launch ZBootloader.exe… **Doubleclick desired controller name to prepare it to firmware upgrade.** Boot device will be detected."

> **§2.2.2 Hardware activation (p.22):** "In some circumstances software activation could not start… For example operation system did not recognize joystick. In this case you even will not see joystick name in the list of connected devices. To activate controller: 1. Disconnect joystick from PC. 2. Run ZBootloader.exe. 3. **Short BOOT jumper on the controller plate**… You can see BOOT jumper of Njoy32 1.1 (a) and VKB Mamba (b) controllers. **Look for BOOT label on other controller PCBs.** Press and hold down Eject and Start buttons of Gladiator joystick, press Boot button on BlackBox Mk2 cover. 4. While BOOT jumper is shorten, connect joystick to the PC and then release jumper."

So: **DFU-style bootloader, entered either by an in-app command or by a hardware BOOT strap + power-cycle.** The device enumerates differently in bootloader mode ("You will see that device is connected"). Flashing is file-pick → single button. **No checksum, no version-compat check, no signing is documented.**

### 4.4 USB identity and PID control

> **§2.4.12 PID control (p.29):** "If you use several VKB devices having same VID&PID you may have some troubles. To avoid it **change controller PID.** Select `Auto` mode in `USB PID` group and set some bias value. **By default GNX controller has 231d/2234 VID/PID. If bias = 3, then PID becomes 2237.** Check it using USBdeview.exe."

→ VID `0x231D` (= 8989), default PID `0x2234` (= 8756), bias is added to the PID. **This is a concrete, checkable fact and the single most useful hook for identifying the device in a custom tool.**

### 4.5 Internal architecture hints

- **§12.2.1 (p.153):** BUS connector pinouts — RJ12 (6P6C) for Mamba/ThrottleBox/Gladiator/BlackBox; **GX-12-4** (BlackBox MkI), **GX-12-7** (MkII); "Njoy32 — Pins on PCB".
- **BUS lines:** "VCC (+5В), Gnd, **Tx1, Tx3**. Tx1 and Tx3 must have **pull-up resistors**." ⇒ single-wire half-duplex serial bus, not SPI, despite the port being called `SPI1`/`SPI2`.
- **§12.2.2 (p.154):** "SPI1 port controls internal button registers… `S-but – standard button registers, 8 buttons each, connected`. Set registers number in `RegN` field." ⇒ `SPI1` is the *host-side* register file, i.e. the button input bus.
- **§12.2.2:** "Expansion devices are interconnected via BUS use **USART #1 or USART #3**. Combined devices use **USART #2**." Serial port mode: Master/Slave; Bus type; Speed.
- **§12.5.2 (p.158):** Gunfighter base + MCG grip defaults: "Serial port mode – Master, Bus type – S Bus, **Speed – 500 kbps**, Poll = 4 ms, AdrH=17, AdrL=8 (base) / AdrL=9 (grip)."
- **§12.3 (p.155):** "Check **External device encoders virtualization** to send encoder data via bus."
- **§12.4.2 Table 12.3 — device presence analysis:** "0 (…) All group devices must be present. Absence of any device causes BUS Error. / 1, 2 — At least one device must be present. / 3 — No BUS errors even no device found."
- **§12.1 (p.153):** "**The same device may be used as master and slave simultaneously.**"

### 4.6 Microcontroller

**Nothing.** The word "microcontroller", "MCU", "STM", "ARM" never appears. The only processor-adjacent mentions are `MaRS` sensors (VKB's own magnetic rotary sensor family: D_MaRS, A_MaRS, V_MaRS), `HFilter` "named by Hruks (newView author)" (Table 3.1), and generic "controller memory". **No part number, no clock, no RAM/flash figures.** A reimplementer gets no hardware hints from this document at all.

---

## 5. FEATURE CHANGELOG — useful as a firmware-capability map

**§1.2 (p.15–18)** — this doubles as an implicit list of what the firmware must support:

- **V.2.7:** relative axes; RadioButton; RelAxes; Ministick mode switch; Boolean functions; Analog POV; new Axis-to-buttons; GTR/GTR2; Trimmer return
- **V.2.8:** RT trigger
- **V.2.9:** MCG Pro folding trigger setup; **Mouse active event**; MCG Pro folding trigger calibration
- **V.2.10:** Smooth trimmer reset; **clipboard for physical lines**; two virtual buttons on diagonal HAT; **CMP (Comparator)**; **JMP (Jumper)**; **Drag'n'Drop profile loading**
- **V.2.11:** BrakeV3; simplified axes-to-buttons
- **V.2.14:** Network technologies; Z-Link; alternative colors; **Flash LED mode**; Forced Limit for relative axes; new BrakeV modes; new response-curve mode; **ButtonD**; **uStick**; **uPOV**; **SwitchCB**; **DZ Switch**; new Tempo features; **SWITCH 0 / PAI INV / SPLIT Rev**; new ministick output types; **Shifter 6W**. *Excluded:* "Profile switch on the fly", "Group button operations". Edited: Button assignments report.
- **V.2.15:** Relative+Absolute virtual mouse mode / instant cursor movement
- **V.2.16:** Extended firmware upgrade method; **Response curve selection**; **ButtonS multi type**; **uPOV**; **Void** (macro delay); **new Boolean functions interface**
- **V.2.17:** Fixed joystick button name error; **Hub checkbox for Booleans**
- **V.2.18:** **Virtual controllers**; **custom axis response curves for virtual mouse**; **PID control**; **instant virtual mouse cursor position**; **ButtonM**; **Modal Switch**; custom multiplier values for encoder-as-trimmer; **Set Value2** for RelAxes; new Sync methods
- **V.2.19:** Additional **ButtonD** parameters

Note V.2.12 and V.2.13 are absent, and **"Profile switch on-the-fly" was REMOVED in V.2.14** even though §2.4.8's `Profile ID` field still exists.

---

## 6. SUMMARY OF WHAT THE MANUAL DOES *NOT* CONTAIN

For an engineering feasibility decision, this is the list that matters:

1. **The `.cfg` file format.** Not one byte described.
2. **The USB transport for `Get`/`Set`.** No endpoints, report IDs, packets, timing, or framing. Only indirect hints: `SD` delay to avoid "specific interaction between Windows and USB devices", partial-write groups existing at all, and Z-Link2's ability to observe shift state.
3. **The on-device memory layout.** Only: 128 lines / 16×8 registers; 8 axes; 4 POVs; 64 toggles; 64 encoders; 4 HATs; 2 shifts; 7 subshifts; 4 modal switches; 8 curves; 8 macro time sets; 118 macros; 4 macro points each.
4. **The 8 response curves.** Their shape, data structure and point format are entirely inside Fig. 3.15/3.16.
5. **The exact maths of every combine mode** (BrakeV/V1/V2/V3, Dir1/2, Combi1, Average), **relative-axis integration**, **filtering** (static/dynamic/HFilter), **gain (MPL/KdHi/KdLo/Bias/Base)**, **response curves**, **Axes2Buttons zone geometry**, **comparator hysteresis**, and **LED priority IDs**.
6. **The physical-line → logical-line default wiring table for each joystick model.** Never given; must be read out of the device (or the Tool's defaults).
7. **All 189 figures.** Every dialog layout, combo box item list, and graph exists only as an image. The `pdftotext` extraction contains captions only.
8. **Any automation surface.** Confirmed absent.
9. **The partial-write parameter group names** (Fig. 9.2).
10. **The LED event IDs** used for priority resolution (§11.2).

---

## 7. NOTABLE GAPS / CONTRADICTIONS / ODDITIES (with quotes)

### 7.1 Internal contradictions

**(a) Axes2Buttons off-by-one conflict between the two implementations.**
§3.7.1 (p.42): "For example **four zones were created (Num = 4), VBbut1 = 89** and Zones type was chosen… buttons 89, 90, 91, 92 will be pressed consequently."
§7.17 (p.131): "For example **four zones were created (N Pos = 5)**, VBbut1 = 61… buttons 61, 62, 63, 64, 65 will be pressed consequently." — and §7.17.1: "If **N Pos = 5**, there will be registered 4 pulses."
→ §3.7's example is wrong (`Num` should be 5) **or** the semantics differ. Same feature, two different counters (`Num` vs `N Pos`), two different first-button field names (`Vbut1` vs `VBut1`/`VBbut1`), and inconsistent trailers handling.

**(b) Encoder pulse-width recommendation conflict.**
§2.3.1 (p.24): "**It is recommended to set T_Enc value between 10 and 50 ms.** If you use internal button mapper, set 10–20 ms. For external mappers use value not less than 20 ms."
§4.3.11 (p.66): "Encoder pulse time is equal to T_Enc global parameter value (ms). **It is recommended to set this value not less then 15 ms.**"
→ 15 is inside 10–50 but *outside* "10–20 for internal mappers" and below "not less than 20 for external mappers".

**(c) SP1…SP7 vs SP1…SP8.**
§2.4.11 (p.28): "Use X and Y fields in **SP1...SP8** groups to set points coordinates."
§2.4.11 (p.28, 6 lines later): "You can place virtual mouse cursor to **up to 7** screen positions… Set X and Y coordinates in corresponding **SP1 ... SP7** fields."

**(d) §4.2 function list contradicts §4.3.6 and §4.3.16.**
List says "**ButtonD – button under control of subshift #7**" (duplicate of ButtonX) and "**Switch CB – POV mode switch**" (duplicate of uStick/uPov). Actual text: §4.3.6 "ButtonD — **Button is automatically released (even if physically stays depressed) if linked button i.e. master button is pressed.**" and §4.3.16 "Several CONSEQUENT lines included into a group. **Complementary button is pressed if all other buttons of the group are released.**"
→ The summary list is unreliable; three of 26 entries are wrong.

**(e) HAT-count parameter named two ways.**
§2.4.1 (p.25): "**`#POV` field** allows to set Hat switch number up to 4."
§4.3.13 (p.71): "**Global parameter `#Hat`** (see 2.4.1 on p. 25) specifies maximum HAT number."
→ One field, two names, cross-referenced as if identical.

**(f) Axes2Buttons vs Boolean "Axis 2 buttons" axis count.**
§3.1 (p.30): "**Maximum axes number that single controller can process is eight.**"
§7.17 (p.131): "You can convert **axes 1...16** rotation to the sequence of button pressings."
→ 16 > 8. Either a stale value from the 16-axis NJoy32 Ultra era, or the Boolean engine has its own independent axis space. **Unresolved.**

**(g) §5.6.2/§2.4.11 point count vs. §6.3.3.**
§5.6.2 (p.108) references "point index from `SP #` counter"; §2.4.11 references SP1…SP8/SP7. No definition of the valid range is ever given.

### 7.2 Undefined / orphaned terms

- **`MF` field** — Table 3.1 `Thr`: "**If Trh>0 than MF field value is used as upper dynamic filter value.**" `MF` appears **exactly once in the entire manual** and is never defined, never listed in any table.
- **`Base` (Base quadrant)** — Table 3.1: "D_MaRS sensor base quadrant for automatic calibration… **Reference parameter.**" Never referenced again.
- **`Dir` (Direction)** — "Controls **normal MaRS rotation direction**." Only meaningful for MaRS sensors; behaviour on D_MaRS vs V_MaRS unspecified.
- **`W105` checkbox** — sits in Table 2.1's checkbox group with **no description whatsoever**.
- **`SD` (Delay of Start Controller)** — described in §2.4.6 but **absent from Table 2.1**, which claims to be "Global controller parameters".
- **`Profile ID` field** — referenced in §2.4.8 but **absent from Table 2.1**.
- **`Rls Time`** — §2.4.4: "Rls Time (FA0 release time) combobox allows to set FA0 parameters **activation** in milliseconds." "activation" is almost certainly "**de**activation"; the intended direction is ambiguous and Table 2.1 omits `Rls Time` entirely (it only has `Time FA0…FA3`).
- **`Precise`** — Table 3.2: "Precision of axis. Axis response digital capacity, bits." **No valid range, no default, no relation to `Hid Usage`/`Dz` values.**
- **`FA0 mode` M1–M4** — Table 4.4 exists but Table 2.1 has no `FA0 mode` row.
- **`Hysteresis`** — listed for both Axes2Buttons (§3.7.1) and Comparator (§7.14) with no statement of units interaction; §7.14 calls it "optional", implying a null/disabled state whose encoding is unspecified.
- **`%` in RelAxes SET Value 2 vs. RelAxes SET FA3 Val vs. `FA3 val.`** — three different value-setting paths for relative axes; only the last has a documented home (Table 3.2).
- **`Direction`/`Inv` in Comparator** — "For Physical or Virtual types, which have center **Inv checkbox allows to select response direction. For Logical type this parameter is ignored.**" → the `Inv` checkbox is *disabled* for Logical axes. A UI must grey it out.

### 7.3 Things that were removed but whose UI remains

- **§1.2.6 (p.17), "Excluded:"** "**Profile switch on the fly**", "Group button operations." — yet §2.4.8 still documents the `Profile ID` field and `Profile N=` INI keys, and §8.5 documents macro group operations. **Dead or vestigial UI, or the removal was partial.**
- **§1.2.6:** "**Edited:** Button assignments report." — no description of what changed.
- **§1.2.6 V.2.10** lists "**JMP function, Jumper in Boolean functions**" — **there is no Jumper/JMP section in Chapter 7.** §7 goes NOT → 2AND → 2OR → 2XOR → 3AND/3OR/3XOR → Triggers → Comparators → Modal switch → Axis 2 buttons. The Jumper feature is announced and then never documented. (Possible that "JMP" was renamed to `M counter` §7.13, but that is never stated.)

### 7.4 Broken cross-references and typos

- **§1.2.8 V.2.16 (p.17):** "Extended firmware upgrade method **()**." — empty cross-reference.
- **§12.6 title (p.160):** "Controller connection using ZLink" and §1.2.6 writes "ZLink" while §12.6.1/§12.6.3 write "**Z-Link2**" and "ZLink2". `Z-Link` vs `ZLink2` vs `ZLink`.
- **§6.3.4 (p.116):** "control units on **Clobal – Common** tab" — typo for "Global".
- **§2.4.9 heading mismatch:** titled "**Virtual devices**", body is entirely virtual *keyboard*. §2.4.10 is "Virtual keyboard modifiers setting". So the TOC advertises a "Virtual devices" concept that has no content of its own.
- **§4.3.19 (p.87):** "**Choose trimmed axis number from `Axis` combo box. Choose trimmed axis number from `Axis` combo box.**" — verbatim duplicated sentence.
- **§4.3.11 (p.68):** figure references out of order and mismatched: "See examples of response curve on Fig. 4.27, 4.28, 4.29. **4.27.** **4.26.** … Fig. 4.27. Pulses per click 4/4, Multiplier 32 / 4.29. / 4.28." Then Fig 4.26 is never described.
- **§4.3.18 Tempo 3** figures are labelled "**Рис.** 4.46/4.47/4.48" (Russian "Рис.") and §4.3.22 PAI INV uses "Рис. 4.64/4.65" — Cyrillic in an English document, evidence of an untranslated working copy.
- **§11.3 (p.149):** a stray "**ш**" character and an empty table row.
- **§12.4.1 (p.155):** a stray "**o**" between text and Table 12.2.
- **§4.2/§4.3.13/§4.3.18:** headings carry stray leading whitespace/tabs ("`    4.3.19. Trimmer`", "`    4.3.20.Curves`") and some TOC entries have no space after the number.
- **TOC omits Ch.7 entirely from the top-level list** — line 303 onward lists "10" then jumps; Ch.7 "Boolean functions" appears at line 288 but Ch.6/7 page markers are inconsistent.
- **Table 2.1 is printed twice** (p.23 and p.24) with content split across the two prints, and **`T_Tgl` is duplicated within it** with two different descriptions.
- **Table 2.2, 3.1, 3.2, 6.2, 11.2 are all split across page boundaries** and repeated — the text extraction repeats the caption. Be careful with any parser.
- **Executable name is inconsistent five ways:** `VKBDevCfgC.exe` (§1, §2.1, §2.2.1), `VKBDevCfg.exe` (§9.1.1, §9.4.2, §12.6.2, Appendix I), `VKBDevConfig.exe` (§2.4.8), `VKBDeviceConfig` ("the main VKBDeviceConfig window", §2.1), `ZBootloader.exe` vs `Z-Bootloader.exe` (§2.2.1) vs `z-bootloader` ("z-bootloader window will be closed automatically"). **If you are reverse-engineering a specific binary, the manual will not tell you which name is canonical.** (The `C` suffix in `VKBDevCfgC.exe` almost certainly means "C" as opposed to a Delphi/VCL variant, but the manual never says so.)
- **`Zconfig.ini` vs `zconfig.ini` vs `ZConfig.ini`** — casing is inconsistent throughout; on Windows this is harmless but it signals the docs are not maintained against a spec.

### 7.5 Documentation-of-last-resort and hazards the manual flags but doesn't resolve

- **§2.4.9 / §5.3.2:** Shift0-to-keystroke **floods the keyboard buffer** — "In this case you **must disconnect joystick**." A new UI should *prevent* this combination outright, and the manual gives you the information to do so.
- **§2.4.11:** virtual mouse "Always On" can be "very difficult to neutralize" by a real mouse.
- **§5.2.3 / §5.11:** "**Be careful to use System function. Improper use can cause operation system malfunction.**" (power down, sleep).
- **§5.5.2:** "**any key press will affect this function**" — the key-capture widget must be process-global.
- **§3.2.1:** "**Wrong sensor type will cause axis malfunction!**"
- **§3.3:** "It is NOT recommended to change default [HID Usage] names. **Wrong name can cause axis malfunction.**"
- **§9.1.1:** "Profiles… must correspond to firmware version" — and **flashing can wipe your config** (§2.2).
- **§2.4.6:** USB save race requires `SD` delay.
- **§12.3 (p.155):** "**Do not use the same addresses for combined devices. Grip controllers have fixed addresses and can not be changed.**" → address collisions produce BUS Errors with no diagnostic beyond "Rudder connect"/"BUS error" LED events.
- **§3.5.1 (p.36):** "You can trim aircraft axes which can not be trimmed in reality. **Cheat detected)))**" — VKB's own acknowledgement that the model permits behaviour real hardware cannot.

### 7.6 Things a new UI would have to *invent*

Because the manual documents the controls but never the layout:
- The **Button mapping wizard** (Fig. 4.2) is the single most important dialog in the app and exists **only** as an image. Its structure — one combo box for the physical function, a dynamically-repopulated parameter area, a second combo/grid for the logical function — is inferable from §4.2.1/§5.2.1/§5.2.3 but never stated.
- The **Physical layer** grid is 128 cells × (physical function + parameters), organised as 16 registers of 8. **§4.2.2** adds `Poll` to flash a cell on activity.
- The **Logical layer** grid is likewise 128 cells, editable standalone.
- **§4.2.1 Next/Previous semantics:** "When you go to next button settings for current one will be fixed… Cancel buttons disables any current settings changes." → per-line transactional commit/cancel semantics. Not documented anywhere else.

---

## 8. ENGINEERING FEASIBILITY ASSESSMENT (inferred strictly from the above)

**Option A — Wrap/automate VKBDevCfg.exe.** *Feasible today.* Fully deterministic because the model is finite and small. The only inputs are `zconfig.ini` (documented), `.cfg` files (opaque but pass-through), `.mcr` files, drag-and-drop, and **clipboard paste of a line's parameter set** (§4.2.1). The biggest risk is the clipboard format — if it's an in-process Delphi object graph rather than text, option A collapses to UI-automation-by-keystrokes. **This is the single highest-value unknown and should be characterised first.**

**Option B — Reimplement the device driver.** *Blocked on unknown-unknowns.* Requires reverse-engineering: the USB endpoints/report IDs; the `Get`/`Set` framing; the parameter-group names from the Partial Write dialog (Fig. 9.2); the LED event IDs; the 8 curve payloads; the default per-model line wiring. Nothing in the manual constrains any of these. The PID fact (§2.4.12: `0x231D`/`0x2234`) and the bootloader BOOT-strap procedure are the only concrete handles. The sibling tools in the `dist/` directory (Z-Bootloader, Z-Link2, VKB_JoyTester) are almost certainly the easiest first targets, because they are smaller and their protocols are narrower than the full configurator's.

**Option C — Pure software joystick remap (e.g. a virtual HID gamepad driver).** *Feasible but semantically weaker.* Everything in Chs.3–8 (relative axes, curve shapes, BrakeV*, Tempo, generators, comparators, macro timing, shift hierarchies) would have to be reimplemented **in host software at the USB polling rate** rather than in the device. The manual gives enough semantics to attempt it (see §1), but the DSP-side functions — dynamic/HFilter filtering, MaRS quadrant tracking, relative-axis integration, LED gauge — have no formulas at all. Expect a reimplementation that is functionally ~80% and behaviourally unverified.

**Design advice for a "more intuitive" UI, derived from the model's real shape:**
1. Lead with the **physical-line grid** (that *is* the device's mental model) but add a **"what does this control do"** view — the vendor has no equivalent; §9.5's report is the only thing close.
2. Always surface the **`En` vs `Vs`** distinction. The vendor's most common misconfiguration trap.
3. Never show a raw line number without an **occupancy indicator** — §4.2.1/§5.3.2 already prove this is the #1 source of collisions ("This number must NOT be the same with existing physical button line").
4. Make the **modifier hierarchy (Shift1/2/0 → SubShift 1–7 → Modal Switch 1–4 → ButtonS/X/M)** a first-class visual, because Table 4.1 shows the output-line arithmetic is otherwise unexplainable.
5. Give **virtual controller assignment** a first-class axis, since the 8-axis Windows ceiling makes it common for anyone with >8 axes.
6. **Block** the dangerous combinations the manual warns about (Shift0→keystroke, Always-On mouse, System power functions, wrong `Input` sensor type, changing `HID Usage`).
7. Use the **INIFILE as a supported feature surface**, not a hack — it is the only vendor-sanctioned configuration channel, and `User=Developer` is a one-line feature unlock.
