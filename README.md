# Quiniela Familiar

## Lo mínimo para usarla

1. Abre `pronosticos.csv`.
2. Reemplaza los ejemplos por tus pronósticos.
3. Conserva exactamente estas columnas:
   - Persona
   - PartidoID
   - Local
   - Visitante
   - PronosticoLocal
   - PronosticoVisitante
4. Sube todos los archivos a un repositorio de GitHub.
5. Activa GitHub Pages desde Settings > Pages.
6. Abre el link público.

La página:
- consulta resultados de partidos;
- recalcula el ranking;
- muestra partidos y marcadores;
- actualiza automáticamente cada 60 segundos.

## Usar Google Sheets en lugar del CSV

Publica la pestaña de pronósticos como CSV y cambia en `config.js`:

predictionsUrl: "TU_URL_CSV_PUBLICA"

No cambies los encabezados.

## Sistema de puntos actual

- 5 puntos: marcador exacto.
- 3 puntos: ganador/empate correcto.
- +1 punto: acertar los goles de al menos uno de los equipos.

Puedes cambiarlo en `config.js`.

## Nota sobre los partidos

La web usa una API pública independiente para los datos del Mundial 2026.
Como no es una fuente oficial de FIFA, si cambia su estructura la sección de partidos puede requerir ajuste.
El archivo `app.js` incluye un adaptador con varias variantes comunes de campos y mensajes de error.
