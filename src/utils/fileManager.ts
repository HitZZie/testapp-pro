// src/utils/fileManager.ts
import { Question } from '../types';

export interface Statistics {
  totalTests: number;
  totalQuestions: number;
  correctAnswers: number;
  averageScore: number;
  testHistory: TestResult[];
  lastUpdated: string;
}

export interface TestResult {
  date: string;
  score: number;
  totalQuestions: number;
  timeSpent: number;
  tema: string;
  questions: Array<{
    question: string;
    userAnswer: string;
    correctAnswer: string;
    isCorrect: boolean;
  }>;
}

export class FileManager {
  private static isElectron = () => {
    return typeof window !== 'undefined' && window.require;
  };

  private static getElectronFS = () => {
    if (this.isElectron()) {
      return window.require('fs');
    }
    return null;
  };

  private static getElectronPath = () => {
    if (this.isElectron()) {
      return window.require('path');
    }
    return null;
  };

  private static getDataDirectory = () => {
    if (this.isElectron()) {
      const { app } = window.require('@electron/remote') || window.require('electron').remote;
      const path = this.getElectronPath();
      return path.join(app.getPath('userData'), 'data');
    }
    return null;
  };

  // PREGUNTAS
  static async saveQuestions(questions: Question[]): Promise<void> {
    if (this.isElectron()) {
      try {
        const fs = this.getElectronFS();
        const path = this.getElectronPath();
        const dataPath = this.getDataDirectory();
        
        if (!fs.existsSync(dataPath)) {
          fs.mkdirSync(dataPath, { recursive: true });
        }
        
        const filePath = path.join(dataPath, 'preguntas.json');
        fs.writeFileSync(filePath, JSON.stringify(questions, null, 2));
        
        // Backup automático
        const backupPath = path.join(dataPath, 'backup');
        if (!fs.existsSync(backupPath)) {
          fs.mkdirSync(backupPath, { recursive: true });
        }
        
        const backupFile = path.join(backupPath, `preguntas_${new Date().toISOString().split('T')[0]}.json`);
        fs.writeFileSync(backupFile, JSON.stringify(questions, null, 2));
        
      } catch (error) {
        console.error('Error guardando preguntas en archivo:', error);
        // Fallback a localStorage
        localStorage.setItem('questions', JSON.stringify(questions));
      }
    } else {
      // Modo web - usar localStorage
      localStorage.setItem('questions', JSON.stringify(questions));
    }
  }

  static async loadQuestions(): Promise<Question[]> {
    if (this.isElectron()) {
      try {
        const fs = this.getElectronFS();
        const path = this.getElectronPath();
        const dataPath = this.getDataDirectory();
        const filePath = path.join(dataPath, 'preguntas.json');
        
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath, 'utf8');
          return JSON.parse(data);
        }
        
        return [];
      } catch (error) {
        console.error('Error cargando preguntas desde archivo:', error);
        // Fallback a localStorage
        const stored = localStorage.getItem('questions');
        return stored ? JSON.parse(stored) : [];
      }
    } else {
      // Modo web - usar localStorage
      const stored = localStorage.getItem('questions');
      return stored ? JSON.parse(stored) : [];
    }
  }

  // ESTADÍSTICAS
  static async saveStatistics(stats: Statistics, usuario: string): Promise<void> {
    if (this.isElectron()) {
      try {
        const fs = this.getElectronFS();
        const path = this.getElectronPath();
        const dataPath = this.getDataDirectory();
        
        if (!fs.existsSync(dataPath)) {
          fs.mkdirSync(dataPath, { recursive: true });
        }
        
        const filePath = path.join(dataPath, `estadisticas_${usuario}.json`);
        fs.writeFileSync(filePath, JSON.stringify(stats, null, 2));
        
      } catch (error) {
        console.error('Error guardando estadísticas:', error);
        localStorage.setItem(`statistics-${usuario}`, JSON.stringify(stats));
      }
    } else {
      localStorage.setItem(`statistics-${usuario}`, JSON.stringify(stats));
    }
  }

  static async loadStatistics(usuario: string): Promise<Statistics> {
    const defaultStats = {
      totalTests: 0,
      totalQuestions: 0,
      correctAnswers: 0,
      averageScore: 0,
      testHistory: [],
      lastUpdated: new Date().toISOString()
    };

    if (this.isElectron()) {
      try {
        const fs = this.getElectronFS();
        const path = this.getElectronPath();
        const dataPath = this.getDataDirectory();
        const filePath = path.join(dataPath, `estadisticas_${usuario}.json`);
        
        if (fs.existsSync(filePath)) {
          const data = fs.readFileSync(filePath, 'utf8');
          return JSON.parse(data);
        }
        
        return defaultStats;
      } catch (error) {
        console.error('Error cargando estadísticas:', error);
        const stored = localStorage.getItem(`statistics-${usuario}`);
        return stored ? JSON.parse(stored) : defaultStats;
      }
    } else {
      const stored = localStorage.getItem(`statistics-${usuario}`);
      return stored ? JSON.parse(stored) : defaultStats;
    }
  }

  // EXPORTAR PARA COMPARTIR
  static async exportQuestionsForSharing(questions: Question[]): Promise<string> {
    if (this.isElectron()) {
      try {
        const fs = this.getElectronFS();
        const path = this.getElectronPath();
        const dataPath = this.getDataDirectory();
        const exportPath = path.join(dataPath, 'export');
        
        if (!fs.existsSync(exportPath)) {
          fs.mkdirSync(exportPath, { recursive: true });
        }
        
        const filePath = path.join(exportPath, 'preguntas_compartir.txt');
        
        let content = '# TestApp Pro - Preguntas para Compartir\n';
        content += `# Exportado el: ${new Date().toLocaleString()}\n`;
        content += `# Total de preguntas: ${questions.length}\n\n`;
        
        questions.forEach((q, index) => {
          content += `## Pregunta ${index + 1}\n`;
          content += `**Tema:** ${q.tema}\n`;
          content += `**Pregunta:** ${q.question}\n`;
          content += `**Opciones:**\n`;
          q.options.forEach((opt, i) => {
            const letra = ['A', 'B', 'C', 'D'][i];
            content += `${letra}) ${opt}\n`;
          });
          content += `**Respuesta correcta:** ${q.answer}\n`;
          content += '\n---\n\n';
        });
        
        fs.writeFileSync(filePath, content, 'utf8');
        return filePath;
      } catch (error) {
        console.error('Error exportando preguntas:', error);
        throw error;
      }
    } else {
      // Modo web - descargar archivo
      const content = `# TestApp Pro - Preguntas\n# Total: ${questions.length}\n\n` +
        questions.map((q, i) => `${i + 1}. ${q.tema}: ${q.question}`).join('\n');
      
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'preguntas_compartir.txt';
      a.click();
      URL.revokeObjectURL(url);
      
      return 'Descargado';
    }
  }

  // OBTENER RUTAS
  static getDataPath(): string {
    if (this.isElectron()) {
      return this.getDataDirectory() || '';
    }
    return 'localStorage';
  }

  static async openDataFolder(): Promise<void> {
    if (this.isElectron()) {
      const { shell } = window.require('electron');
      const dataPath = this.getDataDirectory();
      if (dataPath) {
        shell.openPath(dataPath);
      }
    } else {
      alert('Esta función solo está disponible en la versión de escritorio');
    }
  }
}