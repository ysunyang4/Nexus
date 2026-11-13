!macro NSIS_HOOK_PREINSTALL
  DetailPrint "Closing running Nexus processes to allow clean overwrite..."
  nsExec::Exec 'taskkill /F /IM Nexus.exe'
  nsExec::Exec 'taskkill /F /IM localbridge-desktop.exe'
  nsExec::Exec 'taskkill /F /IM node.exe'
  nsExec::Exec 'taskkill /F /IM tunnel-client-runtime-cloudflared.exe'
  Sleep 1000
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  DetailPrint "Closing running Nexus processes..."
  nsExec::Exec 'taskkill /F /IM Nexus.exe'
  nsExec::Exec 'taskkill /F /IM localbridge-desktop.exe'
  nsExec::Exec 'taskkill /F /IM node.exe'
  nsExec::Exec 'taskkill /F /IM tunnel-client-runtime-cloudflared.exe'
  Sleep 1000
!macroend
