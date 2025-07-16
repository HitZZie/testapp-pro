const { app, BrowserWindow, Menu, shell, ipcMain, dialog } = require('electron');
const path = require('path');
const isDev = process.env.NODE_ENV === 'development';

let mainWindow;

function createWindow() {
  // Crear ventana principal
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false // Para acceso a archivos locales
    },
    titleBarStyle: 'default',
    show: false,
    title: 'TestApp Pro - Sistema de Oposiciones',
    icon: path.join(__dirname, 'icon.png') // Opcional
  });

  // Cargar la aplicación
  const startUrl = isDev 
    ? 'http://localhost:3000' 
    : `file://${path.join(__dirname, '../build/index.html')}`;
  
  mainWindow.loadURL(startUrl);

  // Mostrar cuando esté listo
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
    
    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Eventos de ventana
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Prevenir navegación externa
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // Crear menú personalizado
  createAppMenu();
}

function createAppMenu() {
  const template = [
    {
      label: 'TestApp Pro',
      submenu: [
        {
          label: 'Acerca de TestApp Pro',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'TestApp Pro',
              message: 'TestApp Pro v1.0.0',
              detail: 'Sistema de oposiciones con IA\nAlmacenamiento local seguro\n\nDesarrollado para uso personal',
              buttons: ['OK']
            });
          }
        },
        { type: 'separator' },
        {
          label: 'Configuración',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow.webContents.send('open-settings');
          }
        },
        { type: 'separator' },
        {
          label: 'Salir',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'Archivo',
      submenu: [
        {
          label: 'Nuevo Test',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow.webContents.send('new-test');
          }
        },
        { type: 'separator' },
        {
          label: 'Abrir Carpeta de Datos',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            const dataPath = path.join(app.getPath('userData'), 'data');
            shell.openPath(dataPath);
          }
        },
        {
          label: 'Exportar Preguntas',
          accelerator: 'CmdOrCtrl+E',
          click: () => {
            mainWindow.webContents.send('export-questions');
          }
        },
        { type: 'separator' },
        {
          label: 'Importar Preguntas',
          accelerator: 'CmdOrCtrl+I',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'Archivos de texto', extensions: ['txt'] },
                { name: 'Archivos JSON', extensions: ['json'] },
                { name: 'Todos los archivos', extensions: ['*'] }
              ]
            });
            
            if (!result.canceled && result.filePaths.length > 0) {
              mainWindow.webContents.send('import-questions', result.filePaths[0]);
            }
          }
        }
      ]
    },
    {
      label: 'Test',
      submenu: [
        {
          label: 'Iniciar Test Rápido',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            mainWindow.webContents.send('start-quick-test');
          }
        },
        {
          label: 'Simular Examen',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: () => {
            mainWindow.webContents.send('start-exam-simulation');
          }
        },
        { type: 'separator' },
        {
          label: 'Ver Estadísticas',
          accelerator: 'CmdOrCtrl+S',
          click: () => {
            mainWindow.webContents.send('show-statistics');
          }
        }
      ]
    },
    {
      label: 'Ver',
      submenu: [
        {
          label: 'Recargar',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.webContents.reload();
          }
        },
        {
          label: 'Forzar Recarga',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: () => {
            mainWindow.webContents.reloadIgnoringCache();
          }
        },
        { type: 'separator' },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(currentZoom + 0.1);
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            const currentZoom = mainWindow.webContents.getZoomFactor();
            mainWindow.webContents.setZoomFactor(currentZoom - 0.1);
          }
        },
        {
          label: 'Zoom Reset',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            mainWindow.webContents.setZoomFactor(1);
          }
        },
        { type: 'separator' },
        {
          label: 'Pantalla Completa',
          accelerator: 'F11',
          click: () => {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
          }
        },
        { type: 'separator' },
        {
          label: 'Herramientas de Desarrollo',
          accelerator: 'F12',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    },
    {
      label: 'Ayuda',
      submenu: [
        {
          label: 'Atajos de Teclado',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Atajos de Teclado',
              message: 'Atajos de Teclado',
              detail: 'Ctrl+N: Nuevo Test\nCtrl+T: Test Rápido\nCtrl+Shift+T: Examen\nCtrl+S: Estadísticas\nCtrl+E: Exportar\nCtrl+I: Importar\nCtrl+O: Abrir Datos\nF11: Pantalla Completa\nF12: DevTools',
              buttons: ['OK']
            });
          }
        }
      ]
    }
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// Eventos de la aplicación
app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// IPC Handlers para comunicación con el renderer
ipcMain.handle('show-save-dialog', async (event, options) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: options.defaultPath || 'preguntas_compartir.txt',
    filters: options.filters || [
      { name: 'Archivos de texto', extensions: ['txt'] },
      { name: 'Todos los archivos', extensions: ['*'] }
    ]
  });
  return result;
});

ipcMain.handle('show-open-dialog', async (event, options) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: options.filters || [
      { name: 'Archivos de texto', extensions: ['txt'] },
      { name: 'Archivos JSON', extensions: ['json'] }
    ]
  });
  return result;
});

ipcMain.handle('get-app-path', async (event, name) => {
  return app.getPath(name);
});

ipcMain.handle('show-item-in-folder', async (event, fullPath) => {
  shell.showItemInFolder(fullPath);
});

// Manejar errores
process.on('uncaughtException', (error) => {
  console.error('Error no capturado:', error);
});

process.on('unhandledRejection', (error) => {
  console.error('Promesa rechazada:', error);
});