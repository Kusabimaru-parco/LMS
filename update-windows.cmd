@echo off
rem Updates Campus LMS. Run as administrator.
rem   update-windows.cmd                       rebuild the files already copied into this folder
rem   update-windows.cmd C:\path\release.zip   install a downloaded release (safest: automatic rollback)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\lms.ps1" update %*
pause
