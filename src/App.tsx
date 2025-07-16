import React, { useState, useEffect } from "react";
import { Question } from "./types";
import AddQuestionForm from "./AddQuestionForm";
import ImportTxtQuestions from "./ImportTxtQuestions";
import "./App.css";
import { MODOS } from ".";
import { authenticate, listFiles, downloadFile } from './googleDrive';
import { añadirPregunta, obtenerPreguntas } from './preguntasFirebase';

function shuffle<T>(arr: T[]): T[] {
  return [...arr].sort(() => Math.random() - 0.5);
}

function getTemas(questions: Question[]) {
  const temasUnicos = Array.from(new Set(questions.map(q => q.tema)));
  return ["Todos los temas", ...temasUnicos];
}

// Función para calcular puntuación: cada 3 fallos resta 1 acierto
function calcularPuntuacion(aciertos: number, fallos: number): number {
  const aciertosEfectivos = aciertos - Math.floor(fallos / 3);
  const total = aciertos + fallos;
  if (total === 0) return 0;
  const puntuacion = (aciertosEfectivos / total) * 10;
  return Math.max(0, Math.round(puntuacion * 100) / 100);
}

// Funciones de persistencia
const STORAGE_KEYS = {
  QUESTIONS: 'personal-testing-app-questions',
  HISTORIAL: 'personal-testing-app-historial',
  GROQ_API_KEY: 'personal-testing-app-groq-key',
  CURRENT_USER: 'personal-testing-app-current-user'
};

function saveToStorage(key: string, data: any) {
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch (error) {
    console.error('Error guardando en localStorage:', error);
  }
}

function loadFromStorage<T>(key: string, defaultValue: T): T {
  try {
    const stored = localStorage.getItem(key);
    return stored ? JSON.parse(stored) : defaultValue;
  } catch (error) {
    console.error('Error cargando de localStorage:', error);
    return defaultValue;
  }
}

// Función mejorada para llamar a Groq con prompt optimizado - VERSIÓN CONCISA
async function getExplanationFromGroq(question: Question, userAnswer: string, apiKey: string): Promise<string> {
  if (!apiKey) {
    return "⚠️ No hay API key configurada. Ve a Configuración para añadir tu clave de Groq.";
  }

  try {
    const prompt = `Eres un experto preparador de oposiciones. Proporciona una explicación BREVE y CONCISA:

PREGUNTA: ${question.question}
TEMA: ${question.tema}

OPCIONES:
A) ${question.options[0]}
B) ${question.options[1]}
C) ${question.options[2]}
D) ${question.options[3]}

RESPUESTA CORRECTA: ${question.answer}
TU RESPUESTA: ${userAnswer}

Explica en MÁXIMO 80 palabras:
1. Base legal (artículo/ley específica)
2. Por qué ${question.answer} es correcta
3. ${userAnswer !== question.answer ? `Por qué ${userAnswer} es incorrecta` : 'Concepto clave'}

Formato: "📚 [Base legal] - [Explicación breve]"
Ejemplo: "📚 Art. 103 CE - La Administración sirve con objetividad los intereses generales..."

Respuesta CONCISA:`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Personal-Testing-App/1.0'
      },
      body: JSON.stringify({
        model: 'llama3-8b-8192',
        messages: [
          {
            role: 'system',
            content: 'Eres un preparador de oposiciones español que da explicaciones ULTRA-CONCISAS. Máximo 80 palabras por respuesta. Siempre incluye la base legal específica (artículo, ley) al inicio. Formato: "📚 [Base legal] - [Explicación breve]". Sin párrafos largos, directo al grano.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 150,
        temperature: 0.1,
        stream: false
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Groq API Error:', response.status, errorText);
      throw new Error(`Error ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    
    if (!data.choices || !data.choices[0] || !data.choices[0].message) {
      console.error('Unexpected Groq response:', data);
      return "❌ Respuesta inesperada de Groq.";
    }

    return data.choices[0].message.content || "No se pudo generar una explicación.";

  } catch (error) {
    console.error('Error calling Groq:', error);
    
    if (error instanceof Error) {
      if (error.message.includes('401')) {
        return "❌ API key inválida. Verifica tu clave en Configuración.";
      } else if (error.message.includes('429')) {
        return "⏰ Límite de peticiones excedido. Espera un momento e inténtalo de nuevo.";
      } else if (error.message.includes('400')) {
        return "❌ Error en el formato de la petición.";
      }
      return `❌ Error: ${error.message}`;
    }
    
    return "❌ Error desconocido al conectar con Groq.";
  }
}

export default function App() {
  // Estados existentes...
  const [questions, setQuestions] = useState<Question[]>(() => 
    loadFromStorage(STORAGE_KEYS.QUESTIONS, [])
  );
  const [groqApiKey, setGroqApiKey] = useState<string>(() => 
    loadFromStorage(STORAGE_KEYS.GROQ_API_KEY, "")
  );
  
  // Nuevo estado para usuario actual
  const [currentUser, setCurrentUser] = useState<string>(() => {
    const user = loadFromStorage(STORAGE_KEYS.CURRENT_USER, "Usuario");
    console.log('🔍 Usuario inicial cargado:', user);
    return user;
  });
  
  const [tempUserName, setTempUserName] = useState<string>(currentUser);
  
  // Nuevo estado para feedback del cambio de usuario
  const [userChangeFeedback, setUserChangeFeedback] = useState<string>('');

  // Debug: añadir useEffect para ver cambios de usuario
  useEffect(() => {
    console.log('👤 Usuario actual cambió a:', currentUser);
    saveToStorage(STORAGE_KEYS.CURRENT_USER, currentUser);
  }, [currentUser]);

  // Debug: añadir useEffect para ver cambios de tempUserName
  useEffect(() => {
    console.log('✏️ Temp user name cambió a:', tempUserName);
  }, [tempUserName]);

  // Modificar el historial para incluir usuario
  const [historial, setHistorial] = useState<Array<{ pregunta: Question, acierto: boolean, fecha: number, usuario: string }>>(() => {
    const stored = loadFromStorage(`${STORAGE_KEYS.HISTORIAL}-${currentUser}`, []);
    return stored;
  });

  const [modo, setModo] = useState<string | null>(null);
  const [testQuestions, setTestQuestions] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [temaSeleccionado, setTemaSeleccionado] = useState<string | null>(null);
  const [pendingModo, setPendingModo] = useState<string | null>(null);
  const [answers, setAnswers] = useState<{ [index: number]: string }>({});
  const [pestana, setPestana] = useState<"test" | "preguntas" | "estadisticas" | "configuracion">("test");
  const [subMenuPreguntas, setSubMenuPreguntas] = useState<"añadir" | "añadidas" | "gestion" | null>(null);
  const [testCompleto, setTestCompleto] = useState(false);
  
  // Estados para explicaciones Groq
  const [explanations, setExplanations] = useState<{ [index: number]: string }>({});
  const [loadingExplanation, setLoadingExplanation] = useState<{ [index: number]: boolean }>({});

  // Efectos para guardar datos
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.QUESTIONS, questions);
  }, [questions]);

  useEffect(() => {
    saveToStorage(STORAGE_KEYS.GROQ_API_KEY, groqApiKey);
  }, [groqApiKey]);

  // Efecto para guardar usuario actual
  useEffect(() => {
    saveToStorage(STORAGE_KEYS.CURRENT_USER, currentUser);
  }, [currentUser]);

  // Efecto para cargar historial del usuario actual
  useEffect(() => {
    const userHistorial = loadFromStorage(`${STORAGE_KEYS.HISTORIAL}-${currentUser}`, []);
    setHistorial(userHistorial);
  }, [currentUser]);

  // Efecto para guardar historial del usuario actual
  useEffect(() => {
    saveToStorage(`${STORAGE_KEYS.HISTORIAL}-${currentUser}`, historial);
  }, [historial, currentUser]);

  // Añadir este useEffect después de los otros useEffect existentes
  useEffect(() => {
    const cargarPreguntasFirebase = async () => {
      try {
        const preguntasFirebase = await obtenerPreguntas();
        if (preguntasFirebase.length > 0) {
          setQuestions(preguntasFirebase);
          console.log('Preguntas cargadas desde Firebase:', preguntasFirebase.length);
        }
      } catch (error) {
        console.error('Error cargando preguntas:', error);
      }
    };

    cargarPreguntasFirebase();
  }, []);

  const handleAddQuestion = async (q: Question) => {
    try {
      const resultado = await añadirPregunta(
        q.question,
        q.options,
        q.answer, // Mantener como "A", "B", "C", "D"
        q.tema
      );
      
      if (resultado.success) {
        alert('¡Pregunta añadida exitosamente a Firebase!');
        
        // Recargar preguntas desde Firebase
        const preguntasActualizadas = await obtenerPreguntas();
        setQuestions(preguntasActualizadas);
      } else {
        alert('Error al añadir la pregunta: ' + resultado.message);
      }
    } catch (error) {
      alert('Error al conectar con Firebase');
      console.error(error);
    }
  };
  
  const handleImportQuestions = (imported: Question[]) => {
    setQuestions((prev) => [...prev, ...imported]);
    alert(`Se han añadido ${imported.length} preguntas. Total: ${questions.length + imported.length} preguntas.`);
  };

  const handleDeleteQuestion = (index: number) => {
    if (window.confirm('¿Estás seguro de que quieres eliminar esta pregunta?')) {
      setQuestions((prev) => prev.filter((_, i) => i !== index));
    }
  };

  // Función corregida con feedback
  const confirmarCambioUsuario = () => {
    console.log('🔧 confirmarCambioUsuario ejecutada');
    console.log('📝 tempUserName actual:', tempUserName);
    console.log('👤 currentUser actual:', currentUser);
    
    if (tempUserName.trim() === '') {
      setUserChangeFeedback('❌ El nombre de usuario no puede estar vacío');
      setTimeout(() => setUserChangeFeedback(''), 3000);
      return;
    }
    
    const nuevoUsuario = tempUserName.trim();
    console.log('🆕 Nuevo usuario a setear:', nuevoUsuario);
    
    if (nuevoUsuario !== currentUser) {
      console.log('✅ Cambiando usuario de', currentUser, 'a', nuevoUsuario);
      setCurrentUser(nuevoUsuario);
      
      // Cargar historial del nuevo usuario
      const userHistorial = loadFromStorage(`${STORAGE_KEYS.HISTORIAL}-${nuevoUsuario}`, []);
      console.log('📊 Historial cargado para', nuevoUsuario, ':', userHistorial.length, 'entradas');
      setHistorial(userHistorial);
      
      // Mostrar feedback de éxito
      setUserChangeFeedback(`✅ Iniciada sesión correctamente como "${nuevoUsuario}"`);
      setTimeout(() => setUserChangeFeedback(''), 4000);
      
    } else {
      console.log('⚠️ El usuario ya es el actual, no se cambia');
      setUserChangeFeedback('ℹ️ Ya estás usando ese nombre de usuario');
      setTimeout(() => setUserChangeFeedback(''), 3000);
    }
  };

  // Función de cambio rápido con feedback
  const cambiarAUsuario = (usuario: string) => {
    console.log('🚀 cambiarAUsuario ejecutada con:', usuario);
    setTempUserName(usuario);
    setCurrentUser(usuario);
    
    const userHistorial = loadFromStorage(`${STORAGE_KEYS.HISTORIAL}-${usuario}`, []);
    console.log('📊 Historial cargado para', usuario, ':', userHistorial.length, 'entradas');
    setHistorial(userHistorial);
    
    // Mostrar feedback de cambio rápido
    setUserChangeFeedback(`✅ Iniciada sesión correctamente como "${usuario}"`);
    setTimeout(() => setUserChangeFeedback(''), 4000);
  };

  // Función para borrar usuario
  const borrarUsuario = (usuario: string) => {
    if (usuario === currentUser) {
      alert('No puedes borrar el usuario activo. Cambia a otro usuario primero.');
      return;
    }
    
    if (window.confirm(`¿Estás seguro de que quieres borrar el usuario "${usuario}" y todas sus estadísticas? Esta acción no se puede deshacer.`)) {
      // Borrar historial del usuario
      localStorage.removeItem(`${STORAGE_KEYS.HISTORIAL}-${usuario}`);
      
      // Forzar re-render para actualizar la lista
      setTempUserName(currentUser + ' '); // Trigger temporal
      setTimeout(() => setTempUserName(currentUser), 10);
      
      alert(`Usuario "${usuario}" eliminado correctamente.`);
    }
  };

  // Función para cancelar cambios en el input
  const cancelarCambioUsuario = () => {
    setTempUserName(currentUser);
  };

  // Función para obtener estadísticas de un usuario específico
  const getEstadisticasUsuario = (usuario: string) => {
    const historialUsuario = loadFromStorage(`${STORAGE_KEYS.HISTORIAL}-${usuario}`, []);
    const total = historialUsuario.length;
    const aciertos = historialUsuario.filter((h: any) => h.acierto).length;
    const porcentaje = total ? Math.round((aciertos / total) * 100) : 0;
    return { total, aciertos, porcentaje };
  };

  // Modificar handleAnswer para incluir usuario
  const handleAnswer = (letra: string) => {
    setAnswers((prev) => ({ ...prev, [current]: letra }));
    const acierto = letra === testQuestions[current].answer;
    setHistorial((prev) => [
      ...prev,
      { pregunta: testQuestions[current], acierto, fecha: Date.now(), usuario: currentUser },
    ]);

    // Auto-explicación si la respuesta es incorrecta
    if (!acierto && groqApiKey) {
      getExplanation(current, letra);
    }
  };

  // Función para obtener explicación
  const getExplanation = async (questionIndex: number, userAnswer: string) => {
    if (!groqApiKey) {
      alert("Configura tu API key de Groq en Configuración para obtener explicaciones.");
      return;
    }

    setLoadingExplanation(prev => ({ ...prev, [questionIndex]: true }));
    
    try {
      const explanation = await getExplanationFromGroq(
        testQuestions[questionIndex], 
        userAnswer, 
        groqApiKey
      );
      setExplanations(prev => ({ ...prev, [questionIndex]: explanation }));
    } finally {
      setLoadingExplanation(prev => ({ ...prev, [questionIndex]: false }));
    }
  };

  // Función para recuperar preguntas del localStorage
  const recoverQuestionsFromStorage = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.QUESTIONS);
      if (stored) {
        const storedQuestions: Question[] = JSON.parse(stored);
        if (storedQuestions.length > 0) {
          const currentKeys = new Set(questions.map(q => `${q.question}|${q.tema}`));
          const newQuestions = storedQuestions.filter(q => !currentKeys.has(`${q.question}|${q.tema}`));
          
          if (newQuestions.length > 0) {
            setQuestions((prev) => [...prev, ...newQuestions]);
            alert(`✅ Recuperadas ${newQuestions.length} preguntas del navegador. Total: ${questions.length + newQuestions.length} preguntas.`);
          } else {
            alert('ℹ️ No se encontraron preguntas nuevas en el navegador (todas ya están cargadas).');
          }
        } else {
          alert('ℹ️ No hay preguntas guardadas en el navegador.');
        }
      } else {
        alert('ℹ️ No se encontraron preguntas guardadas en el navegador.');
      }
    } catch (error) {
      console.error('Error recuperando preguntas:', error);
      alert('❌ Error al recuperar preguntas del navegador.');
    }
  };

  // Función para mostrar info de localStorage
  const showStorageInfo = () => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.QUESTIONS);
      const historialStored = localStorage.getItem(STORAGE_KEYS.HISTORIAL);
      
      let message = '📊 Información del navegador:\n\n';
      
      if (stored) {
        const storedQuestions: Question[] = JSON.parse(stored);
        message += `🔹 Preguntas guardadas: ${storedQuestions.length}\n`;
        message += `🔹 Preguntas cargadas actualmente: ${questions.length}\n\n`;
      } else {
        message += `🔹 No hay preguntas guardadas\n\n`;
      }
      
      if (historialStored) {
        const storedHistorial = JSON.parse(historialStored);
        message += `📈 Respuestas en historial: ${storedHistorial.length}\n`;
      } else {
        message += `📈 No hay historial guardado\n`;
      }
      
      message += `\n💾 Los datos se guardan automáticamente en tu navegador.`;
      alert(message);
    } catch (error) {
      alert('❌ Error al leer información del navegador.');
    }
  };

  // Función para limpiar datos
  const clearAllData = () => {
    if (window.confirm('¿Estás seguro de que quieres borrar TODAS las preguntas e historial? Esta acción no se puede deshacer.')) {
      setQuestions([]);
      setHistorial([]);
      localStorage.removeItem(STORAGE_KEYS.QUESTIONS);
      localStorage.removeItem(STORAGE_KEYS.HISTORIAL);
      alert('Todos los datos han sido borrados.');
    }
  };

  // Función para exportar datos
  const exportData = () => {
    const data = {
      preguntas: questions,
      historial: historial,
      exportDate: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `personal-testing-app-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Estadísticas
  const total = historial.length;
  const aciertos = historial.filter(h => h.acierto).length;
  const porcentajeGlobal = total ? Math.round((aciertos / total) * 100) : 0;
  function porcentajeTema(tema: string) {
    const ultimas = historial.filter(h => h.pregunta.tema === tema).slice(-100);
    const aciertosTema = ultimas.filter(h => h.acierto).length;
    return ultimas.length ? Math.round((aciertosTema / ultimas.length) * 100) : 0;
  }

  // Modo repaso inteligente
  const startTest = (modo: string, tema: string) => {
    let pool = questions;
    if (tema && tema !== "Todos los temas") {
      pool = questions.filter(q => q.tema === tema);
    }
    let selected: Question[] = [];
    if (modo === "repaso") {
      const falloCount: { [key: string]: number } = {};
      historial.forEach(h => {
        const key = h.pregunta.question + "|" + h.pregunta.tema;
        if (!h.acierto) falloCount[key] = (falloCount[key] || 0) + 1;
      });
      selected = [...pool]
        .sort((a, b) => {
          const ka = a.question + "|" + a.tema;
          const kb = b.question + "|" + b.tema;
          return (falloCount[kb] || 0) - (falloCount[ka] || 0);
        })
        .slice(0, 20);
    } else if (modo === "examen") selected = shuffle(pool).slice(0, 100);
    else if (modo === "largo") selected = shuffle(pool).slice(0, 50);
    else if (modo === "corto") selected = shuffle(pool).slice(0, 20);
    setTestQuestions(selected);
    setCurrent(0);
    setModo(modo);
    setPendingModo(null);
    setTemaSeleccionado(null);
    setAnswers({});
    setTestCompleto(false);
    setExplanations({});
    setLoadingExplanation({});
  };

  const handleModoClick = (modo: string) => {
    if (modo === "largo" || modo === "corto") {
      setPendingModo(modo);
      setTemaSeleccionado("Todos los temas");
    } else {
      startTest(modo, "Todos los temas");
    }
  };

  const endTest = () => {
    setModo(null);
    setTestQuestions([]);
    setCurrent(0);
    setAnswers({});
    setTestCompleto(false);
    setExplanations({});
    setLoadingExplanation({});
  };

  const finalizarTest = () => {
    setTestCompleto(true);
  };

  // Función para obtener lista de usuarios
  const getUsuarios = (): string[] => {
    const usuarios: Set<string> = new Set();
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('personal-testing-app-historial-')) {
        const usuario = key.replace('personal-testing-app-historial-', '');
        usuarios.add(usuario);
      }
    }
    return Array.from(usuarios);
  };

  // Selector de tema para test largo/corto
  if (pendingModo) {
    const temas = getTemas(questions);
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex'
      }}>
        {/* Sidebar */}
        <div style={{
          width: 280,
          background: 'rgba(255, 255, 255, 0.95)',
          padding: 24,
          boxShadow: '2px 0 10px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ color: '#2c3e50', marginBottom: 24 }}>Personal Testing App</h3>
        </div>

        {/* Main Content */}
        <div style={{
          flex: 1,
          padding: 40,
          background: 'rgba(255, 255, 255, 0.5)'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.5)',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ color: '#2c3e50', marginBottom: 24 }}>Selecciona un tema para el test</h2>
            <select 
              value={temaSeleccionado ?? "Todos los temas"} 
              onChange={e => setTemaSeleccionado(e.target.value)}
              style={{
                width: '100%',
                padding: 12,
                borderRadius: 8,
                border: '1px solid #ddd',
                fontSize: 16,
                marginBottom: 24
              }}
            >
              {temas.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <div style={{ display: 'flex', gap: 16 }}>
              <button
                onClick={() => startTest(pendingModo, temaSeleccionado ?? "Todos los temas")}
                disabled={
                  !temaSeleccionado ||
                  (temaSeleccionado !== "Todos los temas" && questions.filter(q => q.tema === temaSeleccionado).length === 0)
                }
                style={{
                  padding: '12px 24px',
                  background: '#3498db',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
              >
                Empezar test
              </button>
              <button 
                onClick={() => { setPendingModo(null); setTemaSeleccionado(null); }}
                style={{
                  padding: '12px 24px',
                  background: '#95a5a6',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  cursor: 'pointer'
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Pantalla de resultados
  if (testCompleto && testQuestions.length > 0) {
    const respondidas = Object.keys(answers).length;
    const respuestasTest = testQuestions.map((q, i) => ({
      pregunta: q,
      respuesta: answers[i] || null,
      correcta: answers[i] === q.answer
    }));
    
    const aciertosTest = respuestasTest.filter(r => r.correcta).length;
    const fallosTest = respuestasTest.filter(r => r.respuesta && !r.correcta).length;
    const puntuacion = calcularPuntuacion(aciertosTest, fallosTest);
    
    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex'
      }}>
        {/* Sidebar */}
        <div style={{
          width: 280,
          background: 'rgba(255, 255, 255, 0.95)',
          padding: 24,
          boxShadow: '2px 0 10px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ color: '#2c3e50', marginBottom: 24 }}>Personal Testing App</h3>
        </div>

        {/* Main Content */}
        <div style={{
          flex: 1,
          padding: 40,
          background: 'rgba(255, 255, 255, 0.5)'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.5)',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
          }}>
            <h2 style={{ color: '#2c3e50', marginBottom: 24 }}>🎯 Resultados del {MODOS.find(m => m.key === modo)?.label}</h2>
            
            <div style={{ 
              background: 'rgba(255, 255, 255, 0.8)', 
              padding: 32, 
              borderRadius: 16, 
              marginBottom: 24,
              textAlign: 'center',
              boxShadow: '0 4px 16px rgba(0,0,0,0.1)'
            }}>
              <h3 style={{ fontSize: '3em', margin: 0, color: puntuacion >= 5 ? '#27ae60' : '#e74c3c' }}>
                {puntuacion}/10
              </h3>
              <p style={{ margin: '12px 0', fontSize: '1.3em', fontWeight: 'bold' }}>
                {puntuacion >= 5 ? '🎉 ¡Aprobado!' : '❌ Suspenso'}
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 20, marginBottom: 32 }}>
              <div style={{ background: 'rgba(39, 174, 96, 0.1)', padding: 24, borderRadius: 12, textAlign: 'center', border: '2px solid #27ae60' }}>
                <h4 style={{ margin: 0, color: '#27ae60', fontSize: '1.1em' }}>✅ Aciertos</h4>
                <p style={{ fontSize: '2.5em', margin: '12px 0', fontWeight: 'bold', color: '#27ae60' }}>{aciertosTest}</p>
              </div>
              <div style={{ background: 'rgba(231, 76, 60, 0.1)', padding: 24, borderRadius: 12, textAlign: 'center', border: '2px solid #e74c3c' }}>
                <h4 style={{ margin: 0, color: '#e74c3c', fontSize: '1.1em' }}>❌ Fallos</h4>
                <p style={{ fontSize: '2.5em', margin: '12px 0', fontWeight: 'bold', color: '#e74c3c' }}>{fallosTest}</p>
              </div>
              <div style={{ background: 'rgba(243, 156, 18, 0.1)', padding: 24, borderRadius: 12, textAlign: 'center', border: '2px solid #f39c12' }}>
                <h4 style={{ margin: 0, color: '#f39c12', fontSize: '1.1em' }}>⏭️ Sin responder</h4>
                <p style={{ fontSize: '2.5em', margin: '12px 0', fontWeight: 'bold', color: '#f39c12' }}>{testQuestions.length - respondidas}</p>
              </div>
              <div style={{ background: 'rgba(52, 152, 219, 0.1)', padding: 24, borderRadius: 12, textAlign: 'center', border: '2px solid #3498db' }}>
                <h4 style={{ margin: 0, color: '#3498db', fontSize: '1.1em' }}>📊 Total</h4>
                <p style={{ fontSize: '2.5em', margin: '12px 0', fontWeight: 'bold', color: '#3498db' }}>{testQuestions.length}</p>
              </div>
            </div>

            <div style={{ 
              background: 'rgba(255, 255, 255, 0.6)', 
              padding: 20, 
              borderRadius: 12, 
              marginBottom: 32,
              fontSize: '0.9em' 
            }}>
              <h4 style={{ margin: '0 0 12px 0', color: '#2c3e50' }}>💡 Cálculo de puntuación:</h4>
              <p style={{ margin: '4px 0' }}>• Aciertos efectivos: {aciertosTest} - {Math.floor(fallosTest / 3)} = {aciertosTest - Math.floor(fallosTest / 3)}</p>
              <p style={{ margin: '4px 0' }}>• Cada 3 fallos resta 1 acierto</p>
              <p style={{ margin: '4px 0' }}>• Puntuación: ({aciertosTest - Math.floor(fallosTest / 3)} / {respondidas}) × 10 = {puntuacion}</p>
            </div>

            <div style={{ display: 'flex', gap: 16, justifyContent: 'center' }}>
              <button 
                onClick={endTest}
                style={{ 
                  padding: '14px 28px', 
                  background: '#3498db', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                Volver al menú
              </button>
              <button 
                onClick={() => setTestCompleto(false)}
                style={{ 
                  padding: '14px 28px', 
                  background: '#27ae60', 
                  color: 'white', 
                  border: 'none', 
                  borderRadius: 8,
                  cursor: 'pointer',
                  fontSize: '16px'
                }}
              >
                Revisar respuestas
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Render test mode
  if (modo && testQuestions.length > 0) {
    const q = testQuestions[current];
    const userAnswer = answers[current];
    const isCorrect = userAnswer && userAnswer === q.answer;
    const totalAnswered = Object.keys(answers).length;
    
    // Calcular puntuación en tiempo real
    const respuestasHastaAhora = Object.entries(answers).map(([index, respuesta]) => ({
      correcta: respuesta === testQuestions[parseInt(index)].answer
    }));
    const aciertosHastaAhora = respuestasHastaAhora.filter(r => r.correcta).length;
    const fallosHastaAhora = respuestasHastaAhora.filter(r => !r.correcta).length;
    const puntuacionActual = totalAnswered > 0 ? calcularPuntuacion(aciertosHastaAhora, fallosHastaAhora) : 0;

    return (
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        display: 'flex'
      }}>
        {/* Sidebar */}
        <div style={{
          width: 280,
          background: 'rgba(255, 255, 255, 0.95)',
          padding: 24,
          boxShadow: '2px 0 10px rgba(0,0,0,0.1)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <h3 style={{ color: '#2c3e50', marginBottom: 24 }}>Personal Testing App</h3>
          
          <div style={{ 
            background: 'rgba(52, 152, 219, 0.1)', 
            padding: 16, 
            borderRadius: 12, 
            marginBottom: 16,
            border: '1px solid #3498db'
          }}>
            <h4 style={{ margin: 0, color: '#3498db', fontSize: '0.9em' }}>📊 Puntuación actual</h4>
            <p style={{ fontSize: '1.8em', margin: 0, fontWeight: 'bold', color: '#3498db' }}>{puntuacionActual}/10</p>
          </div>

          <div style={{ 
            background: 'rgba(149, 165, 166, 0.1)', 
            padding: 12, 
            borderRadius: 8, 
            fontSize: '0.85em',
            marginBottom: 16
          }}>
            <p style={{ margin: '4px 0' }}>Pregunta {current + 1} de {testQuestions.length}</p>
            <p style={{ margin: '4px 0' }}>Respondidas: {totalAnswered}</p>
            <p style={{ margin: '4px 0' }}>✅ {aciertosHastaAhora} | ❌ {fallosHastaAhora}</p>
          </div>
        </div>

        {/* Main Content */}
        <div style={{
          flex: 1,
          padding: 40,
          background: 'rgba(255, 255, 255, 0.5)'
        }}>
          <div style={{
            background: 'rgba(255, 255, 255, 0.5)',
            borderRadius: 16,
            padding: 32,
            boxShadow: '0 8px 32px rgba(0,0,0,0.1)'
          }}>
            
            <div style={{ marginBottom: 24 }}>
              <h2 style={{ color: '#2c3e50', marginBottom: 8 }}>
                {MODOS.find((m) => m.key === modo)?.label}
              </h2>
              <div style={{ 
                background: 'rgba(52, 73, 94, 0.1)', 
                padding: 16, 
                borderRadius: 8,
                marginBottom: 16
              }}>
                <p style={{ margin: 0, fontSize: '1.1em', color: '#34495e' }}>
                  <strong>{q.tema}:</strong> {q.question}
                </p>
              </div>
            </div>

            <div style={{ marginBottom: 24 }}>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {q.options.map((opt, i) => {
                  const letra = ["A", "B", "C", "D"][i];
                  let backgroundColor = "rgba(255, 255, 255, 0.8)";
                  let borderColor = "#ddd";
                  let textColor = "#2c3e50";
                  
                  if (userAnswer) {
                    if (letra === q.answer) {
                      backgroundColor = "rgba(39, 174, 96, 0.2)";
                      borderColor = "#27ae60";
                      textColor = "#27ae60";
                    }
                    if (letra === userAnswer && userAnswer !== q.answer) {
                      backgroundColor = "rgba(231, 76, 60, 0.2)";
                      borderColor = "#e74c3c";
                      textColor = "#e74c3c";
                    }
                  }
                  
                  return (
                    <li key={i} style={{ margin: "12px 0" }}>
                      <button
                        disabled={!!userAnswer}
                        style={{
                          width: '100%',
                          padding: "16px",
                          background: backgroundColor,
                          border: `2px solid ${borderColor}`,
                          borderRadius: 12,
                          textAlign: 'left',
                          cursor: userAnswer ? "default" : "pointer",
                          fontSize: "16px",
                          fontWeight: "500",
                          color: textColor,
                          transition: 'all 0.2s ease'
                        }}
                        onClick={() => handleAnswer(letra)}
                      >
                        <strong>{letra}:</strong> {opt}
                        {userAnswer && letra === q.answer ? " ✅" : ""}
                        {userAnswer && letra === userAnswer && userAnswer !== q.answer ? " ❌" : ""}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
            
            {userAnswer && (
              <div style={{ 
                background: isCorrect ? 'rgba(39, 174, 96, 0.1)' : 'rgba(231, 76, 60, 0.1)',
                border: `1px solid ${isCorrect ? '#27ae60' : '#e74c3c'}`,
                borderRadius: 8,
                padding: 16,
                marginBottom: 24
              }}>
                <p style={{ 
                  margin: '0 0 12px 0', 
                  fontWeight: 'bold',
                  color: isCorrect ? '#27ae60' : '#e74c3c'
                }}>
                  {isCorrect ? "¡Correcto!" : `Incorrecto. Respuesta correcta: ${q.answer}`}
                </p>
                
                {groqApiKey && (
                  <button
                    onClick={() => getExplanation(current, userAnswer)}
                    disabled={loadingExplanation[current]}
                    style={{
                      padding: '8px 16px',
                      background: '#f39c12',
                      color: 'white',
                      border: 'none',
                      borderRadius: 6,
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    {loadingExplanation[current] ? '🤔 Explicando...' : '🤖 Explicar con IA'}
                  </button>
                )}
              </div>
            )}

            {/* Mostrar explicación de Groq */}
            {explanations[current] && (
              <div style={{
                background: 'rgba(240, 248, 255, 0.9)',
                border: '1px solid #3498db',
                borderRadius: 12,
                padding: 16,
                margin: '16px 0',
                fontSize: '14px'
              }}>
                <h4 style={{ margin: '0 0 12px 0', color: '#3498db', fontSize: '16px' }}>🤖 Explicación de Groq:</h4>
                <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.4, color: '#2c3e50' }}>
                  {explanations[current]}
                </div>
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', gap: 12 }}>
                <button 
                  disabled={current === 0} 
                  onClick={() => setCurrent((c) => c - 1)}
                  style={{
                    padding: '12px 20px',
                    background: current === 0 ? '#bdc3c7' : '#95a5a6',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    cursor: current === 0 ? 'not-allowed' : 'pointer'
                  }}
                >
                  ← Anterior
                </button>
                <button
                  disabled={current === testQuestions.length - 1}
                  onClick={() => setCurrent((c) => c + 1)}
                  style={{
                    padding: '12px 20px',
                    background: current === testQuestions.length - 1 ? '#bdc3c7' : '#95a5a6',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    cursor: current === testQuestions.length - 1 ? 'not-allowed' : 'pointer'
                  }}
                >
                  Siguiente →
                </button>
              </div>
              
              <div style={{ display: 'flex', gap: 12 }}>
                <button 
                  onClick={finalizarTest}
                  style={{ 
                    padding: '12px 20px', 
                    background: '#27ae60', 
                    color: 'white', 
                    border: 'none', 
                    borderRadius: 8,
                    cursor: 'pointer'
                  }}
                >
                  ✅ Finalizar test
                </button>
                <button 
                  onClick={endTest}
                  style={{
                    padding: '12px 20px',
                    background: '#e74c3c',
                    color: 'white',
                    border: 'none',
                    borderRadius: 8,
                    cursor: 'pointer'
                  }}
                >
                  ❌ Salir
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Pantalla principal con imagen de fondo
  return (
    <div style={{
      minHeight: '100vh',
      background: `
        linear-gradient(135deg, rgba(102, 126, 234, 0.8) 0%, rgba(118, 75, 162, 0.8) 100%),
        url('/imagen.jpg')
      `,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
      backgroundRepeat: 'no-repeat',
      backgroundAttachment: 'fixed',
      display: 'flex'
    }}>
      {/* Sidebar Navigation */}
      <div style={{
        width: 280,
        background: 'rgba(26, 26, 46, 0.95)',
        backdropFilter: 'blur(10px)',
        color: 'white',
        padding: '24px 0',
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(255, 255, 255, 0.1)'
      }}>
        <div style={{ padding: '0 24px', marginBottom: 40 }}>
          <h2 style={{ margin: 0, color: '#4fc3f7', fontSize: '1.5em' }}>TestApp Pro</h2>
          <p style={{ margin: '4px 0 0', color: '#ccc', fontSize: '0.9em' }}>Sistema de Oposiciones</p>
        </div>

        <nav style={{ flex: 1 }}>
          {/* Modo Test */}
          <div
            onClick={() => setPestana("test")}
            style={{
              padding: '16px 24px',
              cursor: 'pointer',
              background: pestana === "test" ? '#16213e' : 'transparent',
              borderLeft: pestana === "test" ? '4px solid #4fc3f7' : '4px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}
          >
            <span>📝</span>
            <span>Modo Test</span>
          </div>

          {/* Preguntas con submenu */}
          <div>
            <div
              onClick={() => setPestana("preguntas")}
              style={{
                padding: '16px 24px',
                cursor: 'pointer',
                background: pestana === "preguntas" ? '#16213e' : 'transparent',
                borderLeft: pestana === "preguntas" ? '4px solid #4fc3f7' : '4px solid transparent',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span>📚</span>
                <span>Preguntas</span>
              </div>
              <span style={{ fontSize: '0.8em' }}>▼</span>
            </div>
            
            {pestana === "preguntas" && (
              <div style={{ background: '#0f1419', paddingLeft: 24 }}>
                <div
                  onClick={() => setSubMenuPreguntas("añadir")}
                  style={{
                    padding: '12px 24px',
                    cursor: 'pointer',
                    background: subMenuPreguntas === "añadir" ? '#16213e' : 'transparent',
                    fontSize: '0.9em',
                    color: '#ccc'
                  }}
                >
                  ➕ Añadir preguntas
                </div>
                <div
                  onClick={() => setSubMenuPreguntas("añadidas")}
                  style={{
                    padding: '12px 24px',
                    cursor: 'pointer',
                    background: subMenuPreguntas === "añadidas" ? '#16213e' : 'transparent',
                    fontSize: '0.9em',
                    color: '#ccc'
                  }}
                >
                  📋 Preguntas añadidas
                </div>
                <div
                  onClick={() => setSubMenuPreguntas("gestion")}
                  style={{
                    padding: '12px 24px',
                    cursor: 'pointer',
                    background: subMenuPreguntas === "gestion" ? '#16213e' : 'transparent',
                    fontSize: '0.9em',
                    color: '#ccc'
                  }}
                >
                  🔧 Gestión de preguntas
                </div>
              </div>
            )}
          </div>

          {/* Estadísticas */}
          <div
            onClick={() => setPestana("estadisticas")}
            style={{
              padding: '16px 24px',
              cursor: 'pointer',
              background: pestana === "estadisticas" ? '#16213e' : 'transparent',
              borderLeft: pestana === "estadisticas" ? '4px solid #4fc3f7' : '4px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}
          >
            <span>📊</span>
            <span>Estadísticas</span>
          </div>

          {/* Configuración */}
          <div
            onClick={() => setPestana("configuracion")}
            style={{
              padding: '16px 24px',
              cursor: 'pointer',
              background: pestana === "configuracion" ? '#16213e' : 'transparent',
              borderLeft: pestana === "configuracion" ? '4px solid #4fc3f7' : '4px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 12
            }}
          >
            <span>⚙️</span>
            <span>Configuración</span>
          </div>
        </nav>

        <div style={{ padding: '0 24px', borderTop: '1px solid #333', paddingTop: 16 }}>
          <p style={{ fontSize: '0.8em', color: '#666', margin: 0 }}>
            {questions.length} preguntas cargadas
          </p>
        </div>
      </div>

      {/* Contenido principal */}
      <div style={{
        flex: 1,
        background: 'rgba(255, 255, 255, 0.1)',
        minHeight: '100vh',
        backdropFilter: 'blur(5px)'
      }}>
        <div style={{
          margin: 32,
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(10px)',
          borderRadius: 16,
          padding: 32,
          minHeight: 'calc(100vh - 64px)',
          border: '1px solid rgba(255, 255, 255, 0.2)',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
        }}>
          
          {/* Contenido según pestaña activa */}
          {pestana === "preguntas" && subMenuPreguntas === "añadir" && (
            <div>
              <h2>➕ Añadir Preguntas</h2>
              <ImportTxtQuestions onImport={handleImportQuestions} />
              <AddQuestionForm onAdd={handleAddQuestion} />
              
              <div style={{ 
                background: 'rgba(74, 144, 226, 0.1)', 
                padding: 12, 
                borderRadius: 6, 
                marginTop: 16,
                border: '1px solid rgba(74, 144, 226, 0.3)' 
              }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: '0.9em' }}>🔄 Recuperación</h4>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={recoverQuestionsFromStorage} style={{ fontSize: '0.8em', padding: '6px 12px' }}>
                    📦 Recuperar del navegador
                  </button>
                  <button onClick={showStorageInfo} style={{ fontSize: '0.8em', padding: '6px 12px' }}>
                    ℹ️ Info
                  </button>
                </div>
              </div>
            </div>
          )}

          {pestana === "preguntas" && subMenuPreguntas === "añadidas" && (
            <div>
              <h2>📋 Preguntas Añadidas ({questions.length})</h2>
              <ul style={{ listStyle: 'none', padding: 0 }}>
                {questions.map((q, idx) => (
                  <li key={idx} style={{ 
                    background: 'white', 
                    margin: '8px 0', 
                    padding: 16, 
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <strong>{q.tema}:</strong> {q.question}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pestana === "preguntas" && subMenuPreguntas === "gestion" && (
            <div>
              <h2>🔧 Gestión de Preguntas</h2>
              
              <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
                <button onClick={exportData} style={{ background: '#4caf50', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 4 }}>
                  📥 Exportar backup
                </button>
                <button onClick={clearAllData} style={{ background: '#f44336', color: 'white', border: 'none', padding: '8px 16px', borderRadius: 4 }}>
                  🗑️ Borrar todo
                </button>
              </div>

              <ul style={{ listStyle: 'none', padding: 0 }}>
                {questions.map((q, idx) => (
                  <li key={idx} style={{ 
                    background: 'white', 
                    margin: '8px 0', 
                    padding: 16, 
                    borderRadius: 8,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <strong>{q.tema}:</strong> {q.question}
                    </div>
                    <button 
                      onClick={() => handleDeleteQuestion(idx)}
                      style={{
                        background: '#ff5722',
                        color: 'white',
                        border: 'none',
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: '0.8em',
                        cursor: 'pointer'
                      }}
                    >
                      🗑️ Eliminar
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {pestana === "test" && (
            <div>
              <div style={{ 
                background: 'rgba(227, 242, 253, 0.7)', 
                padding: 8, 
                borderRadius: 4, 
                marginBottom: 16,
                fontSize: '0.85em'
              }}>
                <p style={{ margin: 0 }}><strong>📊 Puntuación:</strong> Sobre 10. Cada 3 fallos = -1 acierto</p>
                <p style={{ margin: 0 }}><strong>🤖 IA:</strong> {groqApiKey ? '✅ Activa (Groq)' : '❌ Configura API key'}</p>
              </div>
              
              {questions.length > 0 ? (
                <div>
                  <h2>Iniciar Test ({questions.length} preguntas disponibles)</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 32 }}>
                    {MODOS.map(modo => (
                      <button
                        key={modo.key}
                        onClick={() => handleModoClick(modo.key)}
                        style={{
                          padding: '24px',
                          background: 'rgba(52, 152, 219, 0.1)',
                          color: '#3498db',
                          border: '2px solid #3498db',
                          borderRadius: 12,
                          cursor: 'pointer',
                          fontSize: '18px',
                          fontWeight: '600',
                          textAlign: 'center',
                          transition: 'all 0.2s ease'
                        }}
                      >
                        {modo.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: '#666' }}>
                  <h3>No hay preguntas cargadas</h3>
                  <p>Añade preguntas para poder iniciar un test.</p>
                </div>
              )}
            </div>
          )}

          {pestana === "estadisticas" && (
            <div>
              <h2>📊 Estadísticas - {currentUser}</h2>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
                <div style={{ background: 'white', padding: 20, borderRadius: 12, textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ margin: 0, color: '#4fc3f7', fontSize: '2em' }}>{questions.length}</h3>
                  <p style={{ margin: '8px 0 0', color: '#666' }}>Preguntas disponibles</p>
                </div>
                <div style={{ background: 'white', padding: 20, borderRadius: 12, textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ margin: 0, color: '#17a2b8', fontSize: '2em' }}>{total}</h3>
                  <p style={{ margin: '8px 0 0', color: '#666' }}>Tests realizados</p>
                </div>
                <div style={{ background: 'white', padding: 20, borderRadius: 12, textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ margin: 0, color: '#28a745', fontSize: '2em' }}>{aciertos}</h3>
                  <p style={{ margin: '8px 0 0', color: '#666' }}>Respuestas correctas</p>
                </div>
                <div style={{ background: 'white', padding: 20, borderRadius: 12, textAlign: 'center', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}>
                  <h3 style={{ margin: 0, color: '#dc3545', fontSize: '2em' }}>{porcentajeGlobal}%</h3>
                  <p style={{ margin: '8px 0 0', color: '#666' }}>Porcentaje global</p>
                </div>
              </div>

              <div style={{ background: 'white', padding: 16, borderRadius: 8 }}>
                <p style={{ margin: 0, color: '#666', fontSize: '0.9em' }}>
                  Las estadísticas se guardan por usuario. Cambia de usuario en Configuración para ver otras estadísticas.
                </p>
              </div>
            </div>
          )}

          {pestana === "configuracion" && (
            <div>
              <h2>⚙️ Configuración</h2>
              
              {/* Sección Usuario mejorada con feedback */}
              <div style={{ background: 'rgba(248, 249, 250, 0.9)', padding: 20, borderRadius: 12, marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#2c3e50' }}>👤 Gestión de Usuario</h3>
                
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                    Cambiar usuario:
                  </label>
                  
                  {/* Feedback del cambio de usuario */}
                  {userChangeFeedback && (
                    <div style={{
                      background: userChangeFeedback.includes('✅') ? 'rgba(39, 174, 96, 0.1)' : 
                                 userChangeFeedback.includes('❌') ? 'rgba(231, 76, 60, 0.1)' : 
                                 'rgba(52, 152, 219, 0.1)',
                      border: `1px solid ${userChangeFeedback.includes('✅') ? '#27ae60' : 
                                      userChangeFeedback.includes('❌') ? '#e74c3c' : 
                                      '#3498db'}`,
                      color: userChangeFeedback.includes('✅') ? '#27ae60' : 
                             userChangeFeedback.includes('❌') ? '#e74c3c' : 
                             '#3498db',
                      padding: '12px 16px',
                      borderRadius: 8,
                      marginBottom: 16,
                      fontSize: '0.95em',
                      fontWeight: '500',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8
                    }}>
                      {userChangeFeedback}
                    </div>
                  )}
                  
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      value={tempUserName}
                      onChange={(e) => {
                        setTempUserName(e.target.value);
                        if (userChangeFeedback) setUserChangeFeedback('');
                      }}
                      style={{
                        padding: '10px 14px',
                        border: '2px solid #e1e8ed',
                        borderRadius: 8,
                        fontSize: '1em',
                        minWidth: 200
                      }}
                      placeholder="Nombre de usuario"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter') {
                          confirmarCambioUsuario();
                        }
                      }}
                    />
                    <button
                      onClick={confirmarCambioUsuario}
                      disabled={tempUserName.trim() === currentUser}
                      style={{
                        background: tempUserName.trim() !== currentUser ? '#28a745' : '#6c757d',
                        color: 'white',
                        border: 'none',
                        padding: '10px 16px',
                        borderRadius: 6,
                        cursor: tempUserName.trim() !== currentUser ? 'pointer' : 'not-allowed',
                        fontSize: '0.9em'
                      }}
                    >
                      ✅ Confirmar
                    </button>
                    {tempUserName !== currentUser && (
                      <button
                        onClick={() => {
                          cancelarCambioUsuario();
                          setUserChangeFeedback('');
                        }}
                        style={{
                          background: '#6c757d',
                          color: 'white',
                          border: 'none',
                          padding: '10px 16px',
                          borderRadius: 6,
                          cursor: 'pointer',
                          fontSize: '0.9em'
                        }}
                      >
                        ❌ Cancelar
                      </button>
                    )}
                  </div>
                  
                  <div style={{ marginTop: 12 }}>
                    <span style={{ 
                      background: '#4fc3f7', 
                      color: 'white', 
                      padding: '6px 12px', 
                      borderRadius: 6, 
                      fontSize: '0.9em',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6
                    }}>
                      👤 Usuario activo: <strong>{currentUser}</strong>
                    </span>
                  </div>
                </div>

                <div style={{ background: '#e8f4fd', padding: 16, borderRadius: 8 }}>
                  <h4 style={{ margin: '0 0 12px 0' }}>📊 Usuarios registrados:</h4>
                  {getUsuarios().length > 0 ? (
                    <div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                        {getUsuarios().map((usuario: string) => {
                          const stats = getEstadisticasUsuario(usuario);
                          const isActive = usuario === currentUser;
                          return (
                            <div 
                              key={usuario}
                              style={{
                                background: isActive ? '#4fc3f7' : '#f8f9fa',
                                color: isActive ? 'white' : '#495057',
                                border: isActive ? 'none' : '1px solid #dee2e6',
                                padding: '8px 12px',
                                borderRadius: 6,
                                fontSize: '0.85em',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 8
                              }}
                            >
                              <span>
                                {usuario} ({stats.total} tests)
                              </span>
                              {!isActive && (
                                <div style={{ display: 'flex', gap: 4 }}>
                                  <button
                                    onClick={() => cambiarAUsuario(usuario)}
                                    style={{
                                      background: '#28a745',
                                      color: 'white',
                                      border: 'none',
                                      padding: '2px 6px',
                                      borderRadius: 3,
                                      fontSize: '0.7em',
                                      cursor: 'pointer'
                                    }}
                                    title="Cambiar a este usuario"
                                  >
                                    🔄
                                  </button>
                                  <button
                                    onClick={() => borrarUsuario(usuario)}
                                    style={{
                                      background: '#dc3545',
                                      color: 'white',
                                      border: 'none',
                                      padding: '2px 6px',
                                      borderRadius: 3,
                                      fontSize: '0.7em',
                                      cursor: 'pointer'
                                    }}
                                    title="Eliminar usuario"
                                  >
                                    🗑️
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <p style={{ margin: 0, color: '#666', fontSize: '0.8em' }}>
                        💡 <strong>Tip:</strong> Haz clic en 🔄 para cambiar de usuario o 🗑️ para eliminarlo
                      </p>
                    </div>
                  ) : (
                    <p style={{ margin: 0, color: '#666', fontSize: '0.9em' }}>
                      No hay otros usuarios registrados
                    </p>
                  )}
                </div>
              </div>

              {/* Sección IA */}
              <div style={{ background: 'rgba(248, 249, 250, 0.9)', padding: 20, borderRadius: 12, marginBottom: 24 }}>
                <h3 style={{ margin: '0 0 16px 0', color: '#2c3e50' }}>🤖 Inteligencia Artificial</h3>
                <p style={{ color: '#666', marginBottom: 16 }}>
                  Configura Groq AI para obtener explicaciones detalladas y gratuitas de las respuestas.
                </p>
                
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', marginBottom: 8, fontWeight: 'bold' }}>
                    API Key de Groq:
                  </label>
                  <input
                    type="password"
                    value={groqApiKey}
                    onChange={(e) => setGroqApiKey(e.target.value)}
                    placeholder="gsk_..."
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      border: '2px solid #e1e8ed',
                      borderRadius: 8,
                      fontFamily: 'monospace',
                      fontSize: '0.9em'
                    }}
                  />
                </div>
                
                <div style={{ 
                  background: groqApiKey ? '#e8f5e8' : '#fff3cd', 
                  padding: 12, 
                  borderRadius: 6,
                  border: `1px solid ${groqApiKey ? '#c3e6cb' : '#ffeaa7'}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: '1.2em' }}>
                      {groqApiKey ? '✅' : '⚠️'}
                    </span>
                    <strong>
                      Estado: {groqApiKey ? 'Configurado y listo' : 'No configurado'}
                    </strong>
                  </div>
                  
                  {!groqApiKey && (
                    <div>
                      <h4 style={{ margin: '8px 0 4px 0' }}>📚 Cómo obtener tu API Key GRATIS:</h4>
                      <ol style={{ margin: 0, paddingLeft: 20 }}>
                        <li>Ve a <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" style={{ color: '#007bff' }}>console.groq.com</a></li>
                        <li>Regístrate con tu email (completamente gratis)</li>
                        <li>Ve a "API Keys" en el menú lateral</li>
                        <li>Crea una nueva clave y cópiala aquí</li>
                      </ol>
                    </div>
                  )}
                  
                  {groqApiKey && (
                    <div>
                      <p style={{ margin: 0, color: '#155724' }}>
                        🚀 <strong>Ventajas activas:</strong> Explicaciones automáticas al fallar, 
                        explicaciones manuales con botón, respuestas rápidas y precisas.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Información del sistema */}
              <div style={{ background: 'rgba(108, 117, 125, 0.1)', padding: 16, borderRadius: 8 }}>
                <h4 style={{ margin: '0 0 8px 0', color: '#495057' }}>💾 Información del sistema</h4>
                <div style={{ fontSize: '0.9em', color: '#666' }}>
                  <p style={{ margin: '4px 0' }}>• Usuario actual: <strong>{currentUser}</strong></p>
                  <p style={{ margin: '4px 0' }}>• Preguntas cargadas: <strong>{questions.length}</strong></p>
                  <p style={{ margin: '4px 0' }}>• Tests realizados: <strong>{historial.length}</strong></p>
                  <p style={{ margin: '4px 0' }}>• Almacenamiento: <strong>Navegador local</strong></p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}