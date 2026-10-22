@echo off
setlocal
cd /d "%~dp0"
set "UMBRAL_PHP=%~dp0..\..\php\php.exe"
if defined PHP_BINARY set "UMBRAL_PHP=%PHP_BINARY%"
if not exist "%UMBRAL_PHP%" (
  where php >nul 2>nul
  if errorlevel 1 (
    echo No se encontro PHP. Instala XAMPP o configura PHP_BINARY con la ruta de php.exe.
    pause
    exit /b 1
  )
  set "UMBRAL_PHP=php"
)
echo UMBRAL - http://127.0.0.1:8091
echo Mantiene esta ventana abierta mientras juegas. Ctrl+C detiene el servidor.
start "" "http://127.0.0.1:8091"
"%UMBRAL_PHP%" -S 127.0.0.1:8091 -t public tools/router.php
pause
