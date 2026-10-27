@echo off
title WhatsApp Transcritor AI - Painel Web
cd /d "%~dp0"
echo ========================================================
echo    WHATSAPP TRANSCRITOR AI - PAINEL WEB
echo ========================================================
echo.
echo Abrindo painel em http://localhost:3000 ...
start http://localhost:3000
node server.js
pause
