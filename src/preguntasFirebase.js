// src/preguntasFirebase.js
import { db } from './firebase';
import { collection, addDoc, getDocs } from 'firebase/firestore';

// Función para añadir una pregunta
export async function añadirPregunta(pregunta, opciones, respuestaCorrecta, categoria = 'General') {
  try {
    await addDoc(collection(db, 'preguntas'), {
      question: pregunta,
      options: opciones,
      answer: respuestaCorrecta, // Guardar como "A", "B", "C", "D"
      tema: categoria,
      fechaCreacion: new Date()
    });
    return { success: true, message: 'Pregunta añadida exitosamente' };
  } catch (error) {
    console.error('Error añadiendo pregunta:', error);
    return { success: false, message: 'Error al añadir la pregunta' };
  }
}

// Función para obtener todas las preguntas
export async function obtenerPreguntas() {
  try {
    const querySnapshot = await getDocs(collection(db, 'preguntas'));
    const preguntas = [];
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      preguntas.push({
        id: doc.id,
        question: data.question,
        options: data.options,
        answer: data.answer,
        tema: data.tema
      });
    });
    return preguntas;
  } catch (error) {
    console.error('Error obteniendo preguntas:', error);
    return [];
  }
}