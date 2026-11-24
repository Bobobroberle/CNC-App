@echo off
rem ---------------------------------------------------------------------------
rem  LowRider Control: den Pi aktualisieren. Doppelklick genuegt.
rem
rem  Liegt neben dem Ordner "pi" (aus lowrider-pi.zip, vorher entpacken).
rem  Es kopiert den Ordner auf den Pi und fuehrt dort setup.sh aus - genau das,
rem  was man sonst in der Eingabeaufforderung tippt. Du wirst zweimal nach dem
rem  Passwort des Pi gefragt (einmal zum Kopieren, einmal zum Einrichten).
rem  Die Datenbank, die Einstellungen und die Verbindung zur Fraese bleiben.
rem  Nicht starten, waehrend ein Job laeuft oder ueber den Pi gestreamt wird -
rem  die Dienste auf dem Pi starten neu. Das Fenster waehrend der Einrichtung
rem  nicht schliessen. Beim allerersten Mal braucht der Pi Internet und es
rem  dauert einige Minuten.
rem
rem  Beim ersten Mal fragt es nach dem Namen des Pi, dem Benutzer und der
rem  Adresse der Fraesensteuerung (Jackpot). Name und Benutzer merkt es sich in
rem  der Datei update-pi.einstellungen.txt neben diesem Skript - nach einem
rem  erfolgreichen Kopieren. Die Jackpot-Adresse behaelt der Pi selbst: sie wird
rem  nur in dem Lauf mitgegeben, in dem sie eingegeben wurde. Falsch eingegeben?
rem  Bei einem Fehler beim Verbinden oder Kopieren fragt das Skript noch einmal,
rem  sonst die Datei loeschen, oder:  update-pi.bat neu
rem
rem  Danach laeuft alles weitere in der App (Einstellungen, Verbindung, Karte
rem  "Update des Pi").
rem
rem  (Nur ASCII-Zeichen: die Eingabeaufforderung zeigt Umlaute sonst falsch.)
rem ---------------------------------------------------------------------------
setlocal EnableExtensions
title LowRider: Pi aktualisieren
rem Zuerst in den Ordner dieses Skripts - pushd geht auch bei einem Netzwerkpfad - dann erst die
rem verzoegerte Erweiterung einschalten: ein Ausrufezeichen im Pfad wuerde sonst verschluckt.
pushd "%~dp0"
if errorlevel 1 goto :no_path
setlocal EnableDelayedExpansion

set "CONFIG=update-pi.einstellungen.txt"
set "PI_HOST=lowrider.local"
set "PI_USER=pi"
set "JACKPOT="
set "ASK=0"
if /i "%~1"=="neu" set "ASK=1"
if not exist "%CONFIG%" set "ASK=1"

echo.
echo  LowRider Control - Pi aktualisieren
echo  -----------------------------------
echo.

where ssh >nul 2>nul
if errorlevel 1 goto :no_ssh
where scp >nul 2>nul
if errorlevel 1 goto :no_ssh

if not exist "pi\setup.sh" goto :no_folder
if not exist "pi\companion.mjs" goto :no_folder
if not exist "pi\lib.sh" goto :no_folder
if not exist "pi\guard.sh" goto :no_folder
if not exist "pi\health-gate.sh" goto :no_folder

rem Was beim letzten Mal eingegeben wurde: zwei Zeilen - Name, Benutzer. Gelesen mit set /p, nicht als
rem Befehl: was in der Datei steht, wird nie ausgefuehrt. Die Jackpot-Adresse steht nicht darin: sie behaelt
rem der Pi, und ein alter Wert wuerde jede Aenderung dort bei jedem Lauf zurueckschreiben.
if exist "%CONFIG%" (
  < "%CONFIG%" (
    set /p PI_HOST=
    set /p PI_USER=
  )
)

:ask
if "!ASK!"=="1" (
  echo  Wie ist der Pi im Netz zu erreichen?
  set "INPUT="
  set /p "INPUT=  Name oder Adresse [Enter = !PI_HOST!]: "
  if defined INPUT set "PI_HOST=!INPUT!"
  set "INPUT="
  set /p "INPUT=  Benutzer am Pi [Enter = !PI_USER!]: "
  if defined INPUT set "PI_USER=!INPUT!"
  echo.
  echo  Adresse der Fraesensteuerung - Jackpot - im Netz, z. B. 192.168.178.40
  echo  Nur beim allerersten Mal noetig, oder wenn sie sich geaendert hat.
  echo  Sonst Enter: der Pi behaelt, was er hat.
  set "INPUT="
  set /p "INPUT=  Jackpot [Enter = unveraendert]: "
  if defined INPUT set "JACKPOT=!INPUT!"
  echo.
)

set "WORD=!PI_HOST!"
call :check_word || goto :bad_input
set "WORD=!PI_USER!"
call :check_word || goto :bad_input
if defined JACKPOT (
  set "WORD=!JACKPOT!"
  call :check_word || goto :bad_input
)

echo  Pi:  !PI_USER!@!PI_HOST!
echo.
echo  1/2  Dateien auf den Pi kopieren ...
echo       (Passwort des Pi eingeben - beim Tippen erscheint nichts.)
echo.
scp -r -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "pi" "!PI_USER!@!PI_HOST!:~/"
if errorlevel 1 goto :scp_failed

rem Die Verbindung steht: die Eingaben werden gemerkt (vorher nicht - ein Tippfehler bliebe sonst stehen)
> "%CONFIG%" (
  echo(!PI_HOST!
  echo(!PI_USER!
)

set "OPTS="
if defined JACKPOT set "OPTS= --fluidnc !JACKPOT!"
echo.
echo  2/2  Auf dem Pi einrichten - das dauert eine Minute, beim allerersten Mal
echo       einige Minuten, und der Pi braucht dann Internet ...
echo       (Noch einmal das Passwort des Pi.)
echo.
ssh -t -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15 "!PI_USER!@!PI_HOST!" "bash ~/pi/setup.sh!OPTS!"
if errorlevel 255 goto :ssh_failed
if errorlevel 1 goto :setup_failed

echo.
echo  ===========================================================
echo   FERTIG. Der Pi hat die neue Version.
echo   Seite in der App neu laden - iPad: App schliessen und neu oeffnen.
echo   Der PI-CODE steht oben, zwischen den ==== Linien.
echo  ===========================================================
echo.
pause
exit /b 0

:check_word
rem Erlaubt nur Buchstaben, Ziffern, Punkt, Minus, Unterstrich. Der Wert kommt aus einer Eingabe und wird
rem hier nur mit Ersetzungen geprueft - nie als Argument weitergereicht und nie durch eine Pipe -, so wird kein
rem Zeichen als Befehl gelesen. Was nach dem Entfernen aller erlaubten Zeichen uebrig bleibt, ist nicht erlaubt.
rem Ist nichts mehr uebrig, wird nicht weiter ersetzt: eine Ersetzung in einer leeren Variable ist nicht in jeder
rem Windows-Fassung eine leere Zeichenfolge.
set "REST=!WORD!"
if not defined REST exit /b 1
for %%C in (a b c d e f g h i j k l m n o p q r s t u v w x y z 0 1 2 3 4 5 6 7 8 9 . - _) do if defined REST set "REST=!REST:%%C=!"
if defined REST exit /b 1
exit /b 0

:bad_input
echo.
echo  Name, Benutzer oder Jackpot-Adresse enthalten ein Zeichen, das nicht erlaubt ist.
echo  Erlaubt sind Buchstaben, Ziffern, Punkt, Minus und Unterstrich.
goto :again

:scp_failed
echo.
echo  Das Kopieren hat nicht geklappt.
echo  - Ist der Pi an und im selben WLAN? Probiere die Adresse statt des Namens,
echo    z. B. 192.168.178.40
echo  - Falsches Passwort? Es ist das Passwort des Benutzers am Pi.
echo  - Steht oben HOST IDENTIFICATION HAS CHANGED, hat der Pi eine neue Identitaet
echo    - zum Beispiel nach einer neuen SD-Karte. Dann einmal diesen Befehl ausfuehren
echo    und das Skript noch einmal starten:
echo        ssh-keygen -R !PI_HOST!
goto :again

:again
echo.
if exist "%CONFIG%" echo  Name und Benutzer stehen in der Datei update-pi.einstellungen.txt neben diesem Skript.
choice /c JN /n /m "  Name, Benutzer oder Adresse neu eingeben? [J/N] "
if errorlevel 2 goto :quit_failed
set "ASK=1"
echo.
goto :ask

:quit_failed
echo.
pause
exit /b 1

:ssh_failed
echo.
echo  Die Verbindung zum Pi ist waehrend der Einrichtung abgebrochen oder das Passwort
echo  war falsch. Auf dem Pi wurde nichts geaendert - noch einmal zu starten ist
echo  gefahrlos.
goto :again

:no_path
echo.
echo  Dieses Skript liegt auf einem Pfad, den die Eingabeaufforderung nicht oeffnen kann.
echo  Bitte lowrider-pi.zip auf diesem PC entpacken - zum Beispiel auf den Desktop -
echo  und update-pi.bat von dort starten.
echo.
pause
exit /b 1

:no_ssh
echo  Auf diesem PC fehlt OpenSSH - ssh und scp.
echo.
echo  So holst du es: Windows-Einstellungen ^> Apps ^> Optionale Features
echo  ^> Feature hinzufuegen ^> OpenSSH-Client ^> Installieren.
echo  Danach dieses Skript noch einmal starten.
echo.
pause
exit /b 1

:no_folder
echo  Der Ordner pi liegt nicht neben diesem Skript, oder er ist unvollstaendig.
echo.
echo  Bitte lowrider-pi.zip zuerst ENTPACKEN - Rechtsklick, Alle extrahieren -,
echo  nicht aus dem Zip heraus starten. Dort liegen update-pi.bat und der
echo  Ordner pi nebeneinander.
echo.
pause
exit /b 1

:setup_failed
echo.
echo  Die Einrichtung auf dem Pi ist gemeldet fehlgeschlagen. Lies die Zeilen
echo  oben:
echo.
echo  - The old version runs again: die ALTE Version laeuft weiter, es ist
echo    nichts kaputt. Die neue wurde nicht uebernommen.
echo  - A browser is connected: in der App unter Einstellungen - Verbindung
echo    die Verbindung zur Fraese trennen und dieses Skript noch einmal starten.
echo  - does not answer either oder no older version: der LowRider-Dienst
echo    auf dem Pi antwortet nicht. Die Steuerung der Fraese laeuft weiter, die
echo    App erreicht sie ueber den Pi aber nicht. Schicke mir die letzten Zeilen.
echo.
pause
exit /b 1
