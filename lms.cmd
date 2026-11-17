@echo off
rem Campus LMS management: lms status ^| start ^| stop ^| restart ^| logs ^| backup ^| restore ^| update ^| rollback ^| help
rem Run from an Administrator command prompt in this folder.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy\windows\lms.ps1" %*
