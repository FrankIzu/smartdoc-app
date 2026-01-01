@echo off
cd /d "C:\llm\projects\grabdocs-app\grabdocs"
echo Removing react-native-worklets-core...
npm uninstall react-native-worklets-core
echo Installing react-native-worklets...
npm install react-native-worklets --legacy-peer-deps
echo Installation complete!
pause

