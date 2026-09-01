# Mesa KSA — Saudi Restaurant POS Prototype

Petpooja-style restaurant POS prototype localized for **Saudi Arabia** (not India).

## Saudi market defaults
- Currency: **SAR**
- Tax: **VAT 15%**
- Language: **English / Arabic** (RTL toggle)
- Payments: Cash, **mada**, Visa/MC, **Apple Pay**, **STC Pay**, split, credit
- Online channels: **HungerStation, Jahez, Keeta, The Chefz, Mrsool**
- Areas: Main Hall, Family Section, Outdoor, Private
- City demo: Riyadh

## Petpooja-like features in prototype
- Billing + roles (Waiter / Cashier / Manager)
- **Masters** — categories & dishes setup (manager)
- **Pizza custom options** — size variations + toppings with max limit alert
- **KOT** send with priority
- Change table + **Merge tables**
- Discounts (0/5/10/15%)
- Temporary bill + settle queue
- Inventory + Back Office
- **CRM / loyalty**
- Advanced menu (categories, PLU codes, A–Z, recent)

## Run
```bash
cd mesa-pos
npm install
npm run dev
```

## Desktop apps (Windows .exe / Mac .dmg)
The till can be packaged as a native desktop app. The POS still talks to `mesa-api` (default `http://localhost:3001`).

**Windows** (this PC):
```bash
npm run desktop:win
```
Installer (one file, like other apps): `release/Mesa-POS-Setup.exe`

Double-click that Setup file. It installs Mesa POS, creates a Desktop shortcut, and adds it to the Start menu. Then search Windows for **Mesa POS**.

**macOS** (must be run on a Mac):
```bash
npm run desktop:mac
```
Disk image: `release/Mesa-POS-0.1.0-mac.dmg`

Preview without an installer:
```bash
npm run desktop
```

## iPhone / iPad
Apple does not allow a sideloaded `.exe`-style app. On iPhone or iPad, open the POS in **Safari**, then **Share → Add to Home Screen**. That installs Mesa POS as a full-screen till app.

A native App Store / TestFlight build needs a Mac, Xcode, and an Apple Developer account. Say if you want that next.

## Demo logins
| Role | User | PIN |
|---|---|---|
| Waiter | Leo Martins | `2222` |
| Cashier | Omar Faris | `1234` |
| Manager | Amina Khan | `1111` |
