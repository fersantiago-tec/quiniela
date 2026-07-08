/*
CONFIGURACIÓN
1) Puedes usar el archivo pronosticos.csv incluido.
2) O publicar una pestaña de Google Sheets como CSV y pegar aquí su URL.

Columnas requeridas:
Persona,PartidoID,Local,Visitante,PronosticoLocal,PronosticoVisitante

Ejemplo PartidoID: 1, 2, 3...
Debe coincidir con el ID/orden del partido que devuelve la API.
*/

window.QUINIELA_CONFIG = {
  predictionsUrl: "pronosticos.csv",
  matchesApi: "https://worldcup26.ir/get/games",
  refreshMs: 60000,

  scoring: {
    exact: 3,
    outcome: 1
  }
};
