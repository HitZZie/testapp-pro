import React, { useState } from "react";
import { Question } from "./types";

const temas = [
  ...Array.from({ length: 10 }, (_, i) => ({ value: `Tema ${i + 1}`, label: `Parte General - Tema ${i + 1}` })),
  ...Array.from({ length: 31 }, (_, i) => ({ value: `Tema ${i + 11}`, label: `Parte Específica - Tema ${i + 11}` })),
];

function AddQuestionForm({ onAdd }: { onAdd: (q: Question) => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", "", "", ""]);
  const [answer, setAnswer] = useState("A");
  const [tema, setTema] = useState(temas[0].value);

  const handleOptionChange = (idx: number, value: string) => {
    const newOptions = [...options];
    newOptions[idx] = value;
    setOptions(newOptions);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim() || options.some((o) => !o.trim())) return;
    
    // Generar ID único
    const newQuestion = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      question,
      options,
      answer,
      tema
    };
    
    onAdd(newQuestion);
    setQuestion("");
    setOptions(["", "", "", ""]);
    setAnswer("A");
    setTema("");
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: "#fff", padding: 16, borderRadius: 8, marginBottom: 24 }}>
      <h2>Añadir pregunta manualmente</h2>
      <div>
        <label>
          Tema:
          <select value={tema} onChange={e => setTema(e.target.value)}>
            {temas.map(t => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div>
        <label>
          Pregunta:
          <input
            type="text"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            required
            style={{ width: "100%" }}
          />
        </label>
      </div>
      <div>
        <label>Opciones:</label>
        {["A", "B", "C", "D"].map((letra, idx) => (
          <div key={letra}>
            <span>{letra}:</span>
            <input
              type="text"
              value={options[idx]}
              onChange={e => handleOptionChange(idx, e.target.value)}
              required
              style={{ width: "80%" }}
            />
          </div>
        ))}
      </div>
      <div>
        <label>
          Respuesta correcta:
          <select value={answer} onChange={e => setAnswer(e.target.value)}>
            {["A", "B", "C", "D"].map(l => (
              <option key={l} value={l}>{l}</option>
            ))}
          </select>
        </label>
      </div>
      <button type="submit">Añadir pregunta</button>
    </form>
  );
}

export default AddQuestionForm;


