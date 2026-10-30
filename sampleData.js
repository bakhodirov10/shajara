/**
 * Shajara namunaviy ma'lumotlari (Sample Family Tree)
 * Ota va Ona (ayoli) juftligi va avlodlari
 */
const SAMPLE_FAMILY_TREE = {
  id: "p_root",
  fullName: "Normat ota Mirzayev",
  birthYear: 1930,
  deathYear: 2005,
  gender: "male",
  spouse: "Saodat aya Mirzayeva",
  spouseBirthYear: 1934,
  spouseDeathYear: 2012,
  children: [
    {
      id: "p_alisher",
      fullName: "Alisher Mirzayev",
      birthYear: 1956,
      deathYear: null,
      gender: "male",
      spouse: "Nodirabegim Mirzayeva",
      spouseBirthYear: 1960,
      spouseDeathYear: null,
      children: [
        {
          id: "p_anvar",
          fullName: "Anvar Mirzayev",
          birthYear: 1982,
          deathYear: null,
          gender: "male",
          spouse: "Shahloxon Mirzayeva",
          spouseBirthYear: 1985,
          spouseDeathYear: null,
          children: [
            {
              id: "p_bobur",
              fullName: "Bobur Mirzayev",
              birthYear: 2010,
              deathYear: null,
              gender: "male",
              spouse: "",
              children: []
            },
            {
              id: "p_nilufar",
              fullName: "Nilufar Mirzayeva",
              birthYear: 2014,
              deathYear: null,
              gender: "female",
              spouse: "",
              children: []
            }
          ]
        },
        {
          id: "p_sardor",
          fullName: "Sardor Mirzayev",
          birthYear: 1987,
          deathYear: null,
          gender: "male",
          spouse: "Dildoraxon Mirzayeva",
          spouseBirthYear: 1990,
          spouseDeathYear: null,
          children: [
            {
              id: "p_temur",
              fullName: "Temurbek Mirzayev",
              birthYear: 2018,
              deathYear: null,
              gender: "male",
              spouse: "",
              children: []
            }
          ]
        },
        {
          id: "p_madina",
          fullName: "Madina Mirzayeva",
          birthYear: 1992,
          deathYear: null,
          gender: "female",
          spouse: "Jamshidbek Qosimov",
          spouseBirthYear: 1989,
          spouseDeathYear: null,
          children: []
        }
      ]
    },
    {
      id: "p_botir",
      fullName: "Botir Mirzayev",
      birthYear: 1961,
      deathYear: null,
      gender: "male",
      spouse: "Gulchehraxon Mirzayeva",
      spouseBirthYear: 1965,
      spouseDeathYear: null,
      children: [
        {
          id: "p_farrux",
          fullName: "Farrux Mirzayev",
          birthYear: 1989,
          deathYear: null,
          gender: "male",
          spouse: "Ziyodaxon Mirzayeva",
          spouseBirthYear: 1993,
          spouseDeathYear: null,
          children: [
            {
              id: "p_kamron",
              fullName: "Kamronbek Mirzayev",
              birthYear: 2019,
              deathYear: null,
              gender: "male",
              spouse: "",
              children: []
            }
          ]
        },
        {
          id: "p_dilorom",
          fullName: "Dilorom Mirzayeva",
          birthYear: 1995,
          deathYear: null,
          gender: "female",
          spouse: "",
          children: []
        }
      ]
    },
    {
      id: "p_zuhra",
      fullName: "Zuhraxon Mirzayeva",
      birthYear: 1966,
      deathYear: null,
      gender: "female",
      spouse: "Rustambek Shokirov",
      spouseBirthYear: 1963,
      spouseDeathYear: null,
      children: [
        {
          id: "p_shahzod",
          fullName: "Shahzodbek Rustamov",
          birthYear: 1993,
          deathYear: null,
          gender: "male",
          spouse: "",
          children: []
        },
        {
          id: "p_malika",
          fullName: "Malika Rustamova",
          birthYear: 1998,
          deathYear: null,
          gender: "female",
          spouse: "",
          children: []
        }
      ]
    }
  ]
};

module.exports = {
  SAMPLE_FAMILY_TREE
};
