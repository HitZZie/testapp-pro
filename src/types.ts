export interface Question {
  id: string;
  question: string;
  options: string[];
  answer: string;
  tema: string;
  dificultad?: string;
  explicacion?: string;
}

export interface TestResult {
  id: string;
  usuario: string;
  fecha: string;
  preguntas: Question[];
  respuestas: string[];
  correctas: number;
  incorrectas: number;
  tiempo: number;
  porcentaje: number;
}