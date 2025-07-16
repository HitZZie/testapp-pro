import React, { useState } from "react";
import { Question } from "./types";

const temas = [
  ...Array.from({ length: 10 }, (_, i) => ({ value: `Tema ${i + 1}`, label: `Parte General - Tema ${i + 1}` })),
  ...Array.from({ length: 31 }, (_, i) => ({ value: `Tema ${i + 11}`, label: `Parte Específica - Tema ${i + 11}` })),
];

interface QuestionDraft {
  question: string;
  options: string[];
  answer: string;
  tema?: string;
}

function ImportTxtQuestions({ onImport }: { onImport: (qs: Question[]) => void }) {
  const [temaDefecto, setTemaDefecto] = useState(temas[0].value);
  const [pendingQuestions, setPendingQuestions] = useState<QuestionDraft[]>([]);
  const [showAssignmentModal, setShowAssignmentModal] = useState(false);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const questions = parseQuestions(content);
      if (questions.length > 0) {
        // En lugar de importar directamente, mostrar el modal de asignación
        setPendingQuestions(questions.map(q => ({ ...q, tema: temaDefecto })));
        setShowAssignmentModal(true);
      } else {
        alert("No se encontraron preguntas válidas en el archivo.");
      }
    };
    reader.readAsText(file, 'utf-8');
  };

  const parseQuestions = (content: string): QuestionDraft[] => {
    const questions: QuestionDraft[] = [];
    
    const questionBlocks = content.split(/\n\s*\n/).filter(block => block.trim());
    
    console.log(`Detectados ${questionBlocks.length} bloques de preguntas`);
    
    questionBlocks.forEach((block, blockIndex) => {
      const lines = block.trim().split('\n').map(line => line.trim()).filter(line => line);
      
      let questionText = "";
      const options: string[] = [];
      let correctAnswer = "";
      
      console.log(`\nProcesando bloque ${blockIndex + 1}:`, lines);
      
      lines.forEach((line, lineIndex) => {
        console.log(`  Línea ${lineIndex + 1}: "${line}"`);
        
        // Detectar pregunta
        if (line.toLowerCase().includes('pregunta:') || 
            (lineIndex === 0 && !line.match(/^\*?[a-d][\):]/i))) {
          questionText = line.replace(/^pregunta:\s*/i, '').trim();
          console.log(`    → Pregunta detectada: "${questionText}"`);
        } 
        // Detectar opciones (acepta tanto : como ))
        else if (line.match(/^\*?[a-d][\):]/i)) {
          const isCorrect = line.startsWith('*');
          const letter = isCorrect ? line.charAt(1).toUpperCase() : line.charAt(0).toUpperCase();
          
          // Detectar si usa : o )
          let optionText = "";
          if (line.includes(':')) {
            optionText = isCorrect ? line.substring(3).trim() : line.substring(2).trim();
          } else if (line.includes(')')) {
            optionText = isCorrect ? line.substring(3).trim() : line.substring(2).trim();
          }
          
          console.log(`    → Opción ${letter}: "${optionText}" ${isCorrect ? '(CORRECTA)' : ''}`);
          
          if (isCorrect) {
            correctAnswer = letter;
          }
          
          options.push(optionText);
        }
      });
      
      console.log(`  Resultado: Pregunta="${questionText}", Opciones=${options.length}, Respuesta="${correctAnswer}"`);
      
      // Validar que tenemos todos los datos necesarios
      if (questionText && options.length === 4 && correctAnswer) {
        questions.push({
          question: questionText,
          options,
          answer: correctAnswer
        });
        console.log(`  ✅ Pregunta ${questions.length} añadida correctamente`);
      } else {
        console.log(`  ❌ Pregunta inválida - Pregunta: ${!!questionText}, Opciones: ${options.length}/4, Respuesta: "${correctAnswer}"`);
      }
    });
    
    console.log(`\nTotal de preguntas procesadas: ${questions.length}`);
    return questions;
  };

  const handleTemaChange = (questionIndex: number, newTema: string) => {
    setPendingQuestions(prev => 
      prev.map((q, i) => i === questionIndex ? { ...q, tema: newTema } : q)
    );
  };

  const handleConfirmImport = () => {
    const finalQuestions: Question[] = pendingQuestions.map(q => ({
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      tema: q.tema!,
      question: q.question,
      options: q.options,
      answer: q.answer
    }));
    
    onImport(finalQuestions);
    setPendingQuestions([]);
    setShowAssignmentModal(false); // ← Cambiar aquí
  };

  const handleCancelImport = () => {
    setShowAssignmentModal(false);
    setPendingQuestions([]);
  };

  const applyTemaToAll = () => {
    setPendingQuestions(prev => 
      prev.map(q => ({ ...q, tema: temaDefecto }))
    );
  };

  if (showAssignmentModal) {
    return (
      <div style={{ 
        position: 'fixed', 
        top: 0, 
        left: 0, 
        right: 0, 
        bottom: 0, 
        background: 'rgba(0,0,0,0.7)', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        zIndex: 1000
      }}>
        <div style={{ 
          background: 'white', 
          padding: 24, 
          borderRadius: 8, 
          maxWidth: '90vw', 
          maxHeight: '90vh', 
          overflow: 'auto',
          width: '800px'
        }}>
          <h2>Asignar temas a las preguntas detectadas</h2>
          <p>Se detectaron {pendingQuestions.length} preguntas. Asigna el tema correspondiente a cada una:</p>
          
          <div style={{ marginBottom: 16 }}>
            <label>
              Tema por defecto:
              <select value={temaDefecto} onChange={e => setTemaDefecto(e.target.value)}>
                {temas.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <button onClick={applyTemaToAll} style={{ marginLeft: 8 }}>
                Aplicar a todas
              </button>
            </label>
          </div>

          <div style={{ maxHeight: '400px', overflow: 'auto' }}>
            {pendingQuestions.map((q, index) => (
              <div key={index} style={{ 
                border: '1px solid #ddd', 
                padding: 12, 
                marginBottom: 12, 
                borderRadius: 4 
              }}>
                <div style={{ marginBottom: 8 }}>
                  <strong>Pregunta {index + 1}:</strong> {q.question}
                </div>
                <div style={{ fontSize: '0.9em', color: '#666', marginBottom: 8 }}>
                  Respuestas: {q.options.map((opt, i) => 
                    `${['A','B','C','D'][i]}: ${opt}`
                  ).join(' | ')} 
                  <strong> (Correcta: {q.answer})</strong>
                </div>
                <div>
                  <label>
                    Tema: 
                    <select 
                      value={q.tema || temaDefecto} 
                      onChange={e => handleTemaChange(index, e.target.value)}
                      style={{ marginLeft: 8 }}
                    >
                      {temas.map(t => (
                        <option key={t.value} value={t.value}>{t.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 16, display: 'flex', gap: 12 }}>
            <button 
              onClick={handleConfirmImport}
              style={{ 
                background: '#4caf50', 
                color: 'white', 
                padding: '8px 16px', 
                border: 'none', 
                borderRadius: 4 
              }}
            >
              Importar {pendingQuestions.length} preguntas
            </button>
            <button 
              onClick={handleCancelImport}
              style={{ 
                background: '#f44336', 
                color: 'white', 
                padding: '8px 16px', 
                border: 'none', 
                borderRadius: 4 
              }}
            >
              Cancelar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: "#fff", padding: 16, borderRadius: 8, marginBottom: 24 }}>
      <h2>Importar preguntas desde archivo TXT</h2>
      
      <div style={{ marginBottom: 16 }}>
        <label>
          Tema por defecto:
          <select value={temaDefecto} onChange={e => setTemaDefecto(e.target.value)}>
            {temas.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: 16 }}>
        <label>
          Seleccionar archivo TXT:
          <input
            type="file"
            accept=".txt"
            onChange={handleFileUpload}
            style={{ marginLeft: 8 }}
          />
        </label>
      </div>

      <div style={{ background: "#f5f5f5", padding: 12, borderRadius: 4, fontSize: "0.9em" }}>
        <h4>Formatos aceptados:</h4>
        <pre>{`Pregunta: ¿Cuál es la capital de Francia?
a) Madrid
*b) París
c) Londres
d) Roma

O también:

Pregunta: ¿Cuál es la capital de España?
a: Madrid
*b: París
c: Londres
d: Roma`}</pre>
        <p><strong>Nota:</strong> 
          - Acepta tanto `)` como `:` después de la letra
          - La respuesta correcta debe empezar con asterisco (*)
          - Después de cargar el archivo, podrás asignar el tema a cada pregunta
        </p>
      </div>
    </div>
  );
}

export default ImportTxtQuestions;
