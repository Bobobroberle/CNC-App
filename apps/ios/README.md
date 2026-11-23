# Native iPad-App (vorbereitet, nicht gebaut)

LowRider Control läuft auf dem iPad als Home-Bildschirm-App aus Safari
([docs/ipad.md](../../docs/ipad.md)). Eine **native Hülle** wäre dieselbe Web-App in einem
WKWebView, verpackt mit [Capacitor](https://capacitorjs.com). In diesem Ordner liegt bewusst nur
diese Beschreibung: kein Xcode-Projekt, keine Capacitor-Abhängigkeiten.

## Was die Hülle bringen würde

- **Garantiert wacher Bildschirm** (`@capacitor-community/keep-awake`) statt des stillen Videos.
- **Haptik**: ein Klick beim Einrasten des Handrads, beim Bestätigen einer Halten-Taste, bei Alarm
  (`@capacitor/haptics`).
- Start ohne Netz: die Oberfläche steckt in der App, nur die Maschine braucht das WLAN.
- Verteilung über TestFlight oder den App Store; lokale Benachrichtigungen bei Job-Ende.

Nichts davon ändert die Bedienung – Gesten, Layout und Sicherheitsregeln sind dieselben.

## Was sie braucht

- Einen **Mac** mit Xcode – oder einen gemieteten macOS-Build-Dienst (GitHub Actions
  `macos-latest`, Codemagic, Ionic Appflow). Unter Windows lässt sich keine iOS-App bauen.
- Ein **Apple-Entwicklerkonto** (99 $/Jahr) für TestFlight/App Store. Ohne: kostenlose Apple-ID,
  dann läuft die App nur 7 Tage und muss jede Woche vom Mac neu aufs iPad gespielt werden.
- In `Info.plist`: `NSLocalNetworkUsageDescription` (Zugriff aufs Werkstattnetz) und
  `NSAppTransportSecurity → NSAllowsLocalNetworking` (http/ws zu Pi und Jackpot).

## Schritte, wenn es so weit ist

```sh
# auf dem Mac, im Projekt
pnpm install && pnpm --filter @lowrider/control build
cd apps/ios
pnpm init
pnpm add @capacitor/core @capacitor/ios @capacitor/haptics @capacitor-community/keep-awake
pnpm add -D @capacitor/cli
pnpm cap init "LowRider Control" de.example.lowrider --web-dir ../control/dist
pnpm cap add ios
pnpm cap sync ios && pnpm cap open ios   # Xcode: Team wählen, iPad anstecken, Run
```

In der Web-App wären dann zwei kleine Stellen anzupassen, beide hinter
`Capacitor.isNativePlatform()`:

1. `apps/control/src/lib/wakeLock.ts`: statt Video `KeepAwake.keepAwake()` / `allowSleep()`.
2. Haptik an drei Stellen: `JogWheel` (Rastung), `HoldButton` (bestätigt), `AlarmBanner`.

Symbol und Startbild erzeugt `pnpm dlx @capacitor/assets generate` aus
`apps/control/icons/icon.svg`.
