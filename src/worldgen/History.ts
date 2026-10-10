// Real names for the kingdoms on the real-world maps. Each kingdom is given
// the name of the medieval realm that stood nearest its seat, roughly as the
// world was between 1100 and 1400: the Kingdom of France around Paris, the
// Mali Empire on the Niger, the Song in southern China. Where no realm in
// the list is near enough, or all the near ones are taken, the kingdom keeps
// its made-up name.
//
// This is part of how a realm is generated, so it must give the same answer
// on the server and in every browser: plain arithmetic, no randomness.

import { GameMapType } from "@crusades/engine-api/game/Maps.gen";

/** [name, longitude, latitude, weight]. A heavier realm claims seats from further away. */
type Realm = [name: string, lon: number, lat: number, weight?: number];

// Europe, North Africa and the Near East.
const WEST: Realm[] = [
  // The British Isles and the north.
  ["Kingdom of England", -1.3, 52.2, 1.5],
  ["Kingdom of Scotland", -3.8, 56.6, 1.2],
  ["Principality of Gwynedd", -3.9, 53.0, 0.7],
  ["Kingdom of Munster", -8.6, 52.3, 0.8],
  ["Kingdom of Connacht", -8.9, 53.8, 0.8],
  ["Kingdom of Leinster", -6.8, 52.9, 0.7],
  ["Kingdom of Ulster", -6.5, 54.7, 0.7],
  ["Kingdom of the Isles", -6.3, 57.3, 0.7],
  ["Earldom of Orkney", -3.0, 59.0, 0.6],
  ["Icelandic Commonwealth", -19.0, 64.9, 1.4],
  ["Kingdom of Norway", 9.5, 61.0, 1.4],
  ["Kingdom of Sweden", 16.5, 59.5, 1.4],
  ["Kingdom of Denmark", 10.0, 56.0, 1.2],
  ["Kingdom of Gotland", 18.5, 57.5, 0.6],
  ["Lands of the Sami", 23.0, 68.5, 1.2],
  ["Tribes of Finland", 25.5, 62.0, 1.0],
  ["Bjarmaland", 41.0, 64.5, 1.2],
  // France and the Low Countries.
  ["Kingdom of France", 2.3, 48.6, 1.6],
  ["Duchy of Normandy", 0.2, 49.2, 0.8],
  ["Duchy of Brittany", -2.8, 48.1, 0.9],
  ["Duchy of Aquitaine", -0.4, 44.9, 1.0],
  ["County of Toulouse", 1.6, 43.7, 0.9],
  ["Duchy of Burgundy", 4.8, 47.1, 0.9],
  ["County of Champagne", 4.1, 48.7, 0.6],
  ["County of Flanders", 3.3, 51.0, 0.8],
  ["Duchy of Brabant", 4.8, 50.9, 0.6],
  ["County of Holland", 4.7, 52.3, 0.7],
  ["County of Provence", 5.9, 43.8, 0.8],
  // Iberia.
  ["Kingdom of Castile", -3.9, 41.0, 1.3],
  ["Kingdom of Leon", -5.8, 42.6, 0.9],
  ["Kingdom of Galicia", -8.2, 42.9, 0.7],
  ["Kingdom of Portugal", -8.4, 40.2, 1.1],
  ["Kingdom of Navarre", -1.7, 42.8, 0.7],
  ["Crown of Aragon", -0.7, 41.6, 1.1],
  ["County of Barcelona", 2.0, 41.7, 0.8],
  ["Emirate of Granada", -3.6, 37.2, 0.9],
  ["Caliphate of Cordoba", -4.9, 37.9, 1.0],
  ["Taifa of Seville", -6.0, 37.4, 0.7],
  ["Taifa of Valencia", -0.5, 39.4, 0.7],
  ["Taifa of Badajoz", -6.9, 38.8, 0.6],
  ["Kingdom of Majorca", 2.9, 39.6, 0.6],
  // The Empire and Italy.
  ["Holy Roman Empire", 10.5, 50.3, 1.6],
  ["Duchy of Saxony", 10.3, 52.5, 0.9],
  ["Duchy of Bavaria", 12.0, 48.5, 0.9],
  ["Duchy of Swabia", 9.3, 48.2, 0.8],
  ["Duchy of Lorraine", 6.2, 48.8, 0.7],
  ["Kingdom of Bohemia", 14.8, 49.8, 1.0],
  ["Duchy of Austria", 15.8, 48.1, 0.9],
  ["March of Brandenburg", 13.3, 52.7, 0.8],
  ["Duchy of Pomerania", 15.5, 53.9, 0.7],
  ["Old Swiss Confederacy", 8.3, 46.9, 0.8],
  ["County of Savoy", 6.6, 45.5, 0.7],
  ["Duchy of Milan", 9.4, 45.5, 0.9],
  ["Republic of Venice", 12.3, 45.5, 1.1],
  ["Republic of Genoa", 9.0, 44.5, 0.8],
  ["Republic of Florence", 11.3, 43.6, 0.8],
  ["Republic of Pisa", 10.4, 43.6, 0.5],
  ["The Papal States", 12.6, 42.4, 1.1],
  ["Kingdom of Naples", 15.0, 40.9, 1.0],
  ["Kingdom of Sicily", 14.0, 37.6, 1.1],
  ["Duchy of Apulia", 16.6, 40.9, 0.7],
  ["Judicate of Arborea", 8.9, 40.0, 0.8],
  ["Lordship of Corsica", 9.1, 42.2, 0.7],
  // The east of Europe.
  ["Kingdom of Poland", 19.5, 51.5, 1.3],
  ["Duchy of Masovia", 21.0, 52.6, 0.7],
  ["Duchy of Silesia", 17.0, 51.0, 0.7],
  ["Teutonic Order", 20.3, 54.2, 1.0],
  ["Livonian Order", 25.0, 57.3, 0.9],
  ["Grand Duchy of Lithuania", 24.5, 55.0, 1.2],
  ["Kingdom of Hungary", 19.5, 47.2, 1.4],
  ["Voivodeship of Transylvania", 24.0, 46.5, 0.9],
  ["Kingdom of Croatia", 16.0, 45.2, 0.9],
  ["Banate of Bosnia", 17.9, 44.0, 0.8],
  ["Kingdom of Serbia", 20.8, 43.4, 1.0],
  ["Republic of Ragusa", 18.1, 42.7, 0.5],
  ["Principality of Zeta", 19.3, 42.5, 0.6],
  ["Second Bulgarian Empire", 25.5, 43.0, 1.2],
  ["Principality of Wallachia", 25.5, 44.6, 0.9],
  ["Principality of Moldavia", 27.5, 47.0, 0.9],
  ["Principality of Albania", 20.0, 41.2, 0.7],
  // The Rus and the steppe.
  ["Novgorod Republic", 32.0, 58.6, 1.4],
  ["Principality of Pskov", 28.5, 57.6, 0.6],
  ["Principality of Polotsk", 28.8, 55.4, 0.8],
  ["Principality of Smolensk", 32.2, 54.8, 0.8],
  ["Grand Principality of Kiev", 30.6, 50.4, 1.3],
  ["Principality of Chernigov", 32.5, 51.8, 0.7],
  ["Galicia-Volhynia", 24.5, 50.0, 1.0],
  ["Vladimir-Suzdal", 40.4, 56.2, 1.3],
  ["Grand Duchy of Moscow", 37.4, 55.5, 0.9],
  ["Principality of Ryazan", 40.0, 54.3, 0.8],
  ["Principality of Tver", 35.8, 56.9, 0.7],
  ["Volga Bulgaria", 50.0, 55.2, 1.3],
  ["Great Perm", 56.0, 59.5, 1.2],
  ["Cumania", 37.0, 48.0, 1.4],
  ["Golden Horde", 46.5, 48.3, 1.5],
  ["Khanate of Crimea", 34.3, 45.2, 0.9],
  ["Principality of Theodoro", 33.8, 44.6, 0.4],
  ["Kingdom of Alania", 43.5, 43.3, 0.9],
  ["Circassia", 39.5, 44.5, 0.8],
  // Byzantium, Anatolia and the Caucasus.
  ["Byzantine Empire", 28.6, 41.2, 1.5],
  ["Empire of Nicaea", 29.6, 40.2, 0.9],
  ["Empire of Trebizond", 39.5, 40.8, 0.9],
  ["Sultanate of Rum", 32.5, 38.0, 1.3],
  ["Beylik of Karaman", 33.3, 37.0, 0.8],
  ["Ottoman Beylik", 30.0, 39.8, 0.7],
  ["Danishmendids", 37.0, 39.6, 0.8],
  ["Kingdom of Cilicia", 35.5, 37.2, 0.8],
  ["Kingdom of Georgia", 44.0, 42.0, 1.1],
  ["Kingdom of Armenia", 44.5, 40.0, 0.9],
  ["Shirvanshahs", 48.7, 40.6, 0.8],
  // Greece and the Aegean.
  ["Despotate of Epirus", 20.9, 39.5, 0.9],
  ["Kingdom of Thessalonica", 23.0, 40.7, 0.9],
  ["Lordship of Thessaly", 22.2, 39.5, 0.7],
  ["Duchy of Neopatras", 22.3, 38.9, 0.5],
  ["Marquisate of Bodonitsa", 22.6, 38.7, 0.45],
  ["County of Salona", 22.3, 38.5, 0.45],
  ["Duchy of Athens", 23.6, 38.1, 0.8],
  ["Lordship of Thebes", 23.3, 38.35, 0.45],
  ["Lordship of Negroponte", 23.8, 38.6, 0.6],
  ["Lordship of Corinth", 22.9, 37.9, 0.45],
  ["Principality of Achaea", 21.8, 37.8, 0.8],
  ["Barony of Patras", 21.75, 38.2, 0.45],
  ["Lordship of Argos", 22.75, 37.6, 0.45],
  ["Despotate of the Morea", 22.4, 37.05, 0.7],
  ["Lordship of Monemvasia", 23.0, 36.7, 0.45],
  ["Barony of Kalamata", 22.1, 37.05, 0.4],
  ["County of Cephalonia", 20.6, 38.2, 0.5],
  ["Duchy of the Archipelago", 25.4, 37.1, 0.8],
  ["Lordship of Andros", 24.9, 37.85, 0.4],
  ["Lordship of Tinos", 25.15, 37.55, 0.35],
  ["Lordship of Milos", 24.45, 36.7, 0.4],
  ["Lordship of Santorini", 25.4, 36.4, 0.4],
  ["Kingdom of Candia", 24.9, 35.25, 1.0],
  ["Lordship of Chania", 23.9, 35.4, 0.5],
  ["Lordship of Sitia", 26.0, 35.15, 0.45],
  ["Knights of Rhodes", 28.0, 36.2, 0.8],
  ["Lordship of Kos", 27.2, 36.85, 0.4],
  ["Lordship of Karpathos", 27.15, 35.6, 0.4],
  ["Lordship of Chios", 26.05, 38.4, 0.6],
  ["Lordship of Lesbos", 26.3, 39.2, 0.6],
  ["Lordship of Samos", 26.8, 37.75, 0.45],
  ["Lordship of Lemnos", 25.2, 39.9, 0.5],
  ["Lordship of Skyros", 24.55, 38.9, 0.35],
  ["Lordship of Thasos", 24.7, 40.7, 0.4],
  ["Monastic State of Athos", 24.2, 40.25, 0.45],
  ["Principality of Serres", 23.55, 41.1, 0.5],
  ["Lordship of Chalcidice", 23.4, 40.3, 0.45],
  ["Lordship of Gallipoli", 26.6, 40.4, 0.5],
  ["Beylik of Karasi", 27.2, 39.6, 0.6],
  ["Beylik of Sarukhan", 27.6, 38.7, 0.6],
  ["Beylik of Aydin", 27.5, 37.9, 0.7],
  ["Beylik of Menteshe", 28.2, 37.2, 0.7],
  ["Lordship of Phocaea", 26.75, 38.67, 0.4],
  ["Lordship of Smyrna", 27.15, 38.4, 0.45],
  ["Lordship of the Troad", 26.4, 39.9, 0.45],
  ["Beylik of Germiyan", 29.5, 39.0, 0.6],
  ["Lordship of Philadelphia", 28.5, 38.35, 0.4],
  // The Levant, Arabia and Persia.
  ["Kingdom of Cyprus", 33.3, 35.0, 0.9],
  ["Kingdom of Jerusalem", 35.2, 32.2, 1.0],
  ["County of Tripoli", 35.9, 34.5, 0.6],
  ["Principality of Antioch", 36.2, 36.1, 0.8],
  ["County of Edessa", 38.8, 37.2, 0.7],
  ["Emirate of Damascus", 36.4, 33.5, 0.9],
  ["Emirate of Aleppo", 37.2, 36.0, 0.8],
  ["Emirate of Mosul", 43.0, 36.3, 0.9],
  ["Abbasid Caliphate", 44.4, 33.3, 1.4],
  ["Ayyubid Sultanate", 31.2, 30.0, 1.5],
  ["Sharifate of Mecca", 40.0, 22.0, 1.2],
  ["Emirate of Nejd", 45.5, 25.0, 1.1],
  ["Rasulid Sultanate", 44.5, 14.5, 1.2],
  ["Imamate of Oman", 57.5, 22.5, 1.1],
  ["Kingdom of Hormuz", 56.3, 27.2, 0.9],
  ["Seljuk Empire", 51.5, 34.5, 1.5],
  ["Atabegs of Fars", 52.5, 29.6, 0.9],
  ["Atabegs of Azerbaijan", 46.5, 38.0, 0.9],
  ["Ilkhanate", 48.5, 35.8, 1.2],
  ["Khwarazmian Empire", 60.0, 41.5, 1.4],
  ["Ghurid Sultanate", 64.5, 34.0, 1.2],
  // North Africa.
  ["Marinid Sultanate", -5.5, 33.8, 1.2],
  ["Almohad Caliphate", -7.9, 31.4, 1.3],
  ["Kingdom of Tlemcen", -1.3, 34.8, 0.9],
  ["Hafsid Sultanate", 9.8, 35.8, 1.1],
  ["Emirate of Bejaia", 5.0, 36.3, 0.7],
  ["Emirate of Tripoli", 13.3, 32.3, 0.9],
  ["Emirate of Barca", 21.5, 32.0, 0.9],
  ["Emirate of Fezzan", 14.5, 26.5, 1.0],
  ["Tuareg Confederation", 6.0, 24.0, 1.3],
  ["Banu Hilal", 3.0, 31.5, 1.0],
  ["Sanhaja Confederation", -10.5, 24.0, 1.2],
  // Gaps found by trying the maps: the far north, the steppe, the desert, and more of the Aegean.
  ["Nenets Tribes", 48.0, 67.5, 1.2],
  ["Republic of Jamtland", 14.5, 63.2, 0.9],
  ["Earldom of Trondelag", 10.8, 63.6, 0.8],
  ["Kvenland", 24.0, 66.5, 1.0],
  ["Tribes of Karelia", 33.0, 63.5, 1.1],
  ["Principality of Beloozero", 37.8, 60.0, 0.9],
  ["Lands of Zavolochye", 43.0, 62.2, 1.1],
  ["Principality of Ustyug", 46.3, 60.8, 0.8],
  ["Eastfjords Chieftaincy", -14.5, 65.2, 0.7],
  ["Principality of Murom", 42.0, 55.6, 0.7],
  ["Mordvin Lands", 44.5, 54.2, 0.9],
  ["Kipchak Khanate", 41.0, 48.5, 1.1],
  ["Republic of Tana", 39.3, 47.2, 0.6],
  ["Banu Sulaym", 26.5, 30.8, 1.0],
  ["Tribes of the Nafud", 41.0, 29.5, 1.1],
  ["Lordship of Kastoria", 21.3, 40.5, 0.6],
  ["Lordship of Ohrid", 20.8, 41.1, 0.6],
  ["Lordship of Ainos", 26.1, 40.75, 0.5],
  ["Lordship of Lopadion", 28.3, 40.15, 0.5],
  ["Lordship of Cerigo", 23.0, 36.25, 0.5],
  ["Lordship of Icaria", 26.15, 37.6, 0.4],
  ["Lordship of Demetrias", 22.95, 39.35, 0.5],
  ["Lordship of Skopelos", 23.7, 39.12, 0.4],
  ["Lordship of Kea", 24.35, 37.6, 0.4],
  ["Lordship of Syros", 24.9, 37.45, 0.35],
  ["Lordship of Hydra", 23.45, 37.33, 0.35],
  ["Lordship of Naupaktos", 21.83, 38.4, 0.4],
  ["Lordship of Sardis", 28.05, 38.5, 0.4],
  ["Lands of the Kola Sami", 34.0, 68.5, 1.0],
];

// The rest of the world, for the map of the whole Earth.
const WORLD: Realm[] = [
  // Africa south of the Sahara.
  ["Mali Empire", -7.5, 12.8, 1.5],
  ["Ghana Empire", -8.0, 16.0, 1.1],
  ["Songhai Empire", 0.0, 16.3, 1.3],
  ["Kingdom of Takrur", -14.0, 16.0, 0.9],
  ["Mossi Kingdoms", -1.5, 12.4, 0.9],
  ["Hausa Kingdoms", 8.5, 12.0, 1.1],
  ["Kanem-Bornu Empire", 14.5, 13.5, 1.3],
  ["Kingdom of Benin", 5.6, 6.3, 1.0],
  ["Kingdom of Ife", 4.5, 7.5, 0.8],
  ["Kingdom of Nri", 7.0, 6.1, 0.7],
  ["Kingdom of Makuria", 31.0, 19.0, 1.2],
  ["Kingdom of Alodia", 33.5, 15.0, 1.1],
  ["Ethiopian Empire", 39.0, 10.5, 1.4],
  ["Sultanate of Adal", 43.0, 10.0, 0.9],
  ["Ajuran Sultanate", 45.0, 3.0, 1.1],
  ["Sultanate of Darfur", 24.5, 13.5, 1.1],
  ["Kilwa Sultanate", 39.5, -8.9, 1.2],
  ["Sultanate of Mombasa", 39.7, -4.0, 0.8],
  ["Kingdom of Kitara", 31.5, 0.8, 1.1],
  ["Kingdom of Kongo", 14.5, -6.0, 1.3],
  ["Kingdom of Loango", 12.0, -4.5, 0.7],
  ["Kingdom of Luba", 26.0, -8.5, 1.2],
  ["Kingdom of Mapungubwe", 29.4, -22.2, 1.1],
  ["Kingdom of Zimbabwe", 31.0, -19.5, 1.2],
  ["Kingdom of Mutapa", 31.5, -16.5, 0.9],
  ["Khoikhoi Clans", 20.0, -31.0, 1.3],
  ["San Peoples", 21.0, -23.0, 1.2],
  ["Kingdom of Imerina", 47.5, -19.0, 1.3],
  ["Sakalava Kingdoms", 44.5, -21.5, 0.9],
  // Central Asia and the steppe.
  ["Mongol Empire", 104.0, 47.0, 1.6],
  ["Chagatai Khanate", 72.0, 42.0, 1.3],
  ["Qara Khitai", 76.0, 44.5, 1.1],
  ["Kimek Confederation", 70.0, 51.0, 1.3],
  ["Khanate of Sibir", 68.0, 57.5, 1.3],
  ["Yenisei Kyrgyz", 91.0, 54.0, 1.2],
  ["Kingdom of Qocho", 89.5, 43.0, 1.0],
  ["Kara-Khanid Khanate", 76.5, 39.5, 1.0],
  ["Western Xia", 105.5, 38.5, 1.1],
  ["Naiman Khanate", 92.0, 48.0, 1.0],
  ["Keraite Khanate", 103.0, 49.5, 0.8],
  ["Buryat Tribes", 108.0, 53.0, 1.1],
  ["Evenk Clans", 112.0, 60.0, 1.4],
  ["Sakha Clans", 128.0, 62.5, 1.4],
  ["Samoyedic Tribes", 78.0, 66.0, 1.4],
  ["Chukchi Clans", 170.0, 66.0, 1.4],
  ["Koryak Clans", 162.0, 60.0, 1.2],
  ["Nivkh Clans", 141.0, 52.5, 1.0],
  // East Asia.
  ["Song Dynasty", 116.0, 29.0, 1.5],
  ["Jin Dynasty", 116.0, 39.0, 1.4],
  ["Kingdom of Dali", 100.5, 25.5, 1.1],
  ["Tibetan Kingdoms", 90.0, 30.5, 1.4],
  ["Kingdom of Guge", 80.0, 31.5, 0.9],
  ["Kingdom of Goryeo", 127.5, 37.5, 1.2],
  ["Jurchen Tribes", 130.0, 45.5, 1.2],
  ["Kamakura Shogunate", 138.5, 36.0, 1.3],
  ["Northern Fujiwara", 141.0, 39.5, 0.8],
  ["Ainu Lands", 143.0, 43.5, 1.0],
  ["Kingdom of Ryukyu", 127.8, 26.3, 0.8],
  // South Asia.
  ["Delhi Sultanate", 77.0, 28.0, 1.5],
  ["Kingdom of Kashmir", 75.0, 34.0, 0.9],
  ["Sena Dynasty", 88.5, 24.0, 1.1],
  ["Kingdom of Kamarupa", 92.0, 26.2, 0.9],
  ["Kingdom of Nepal", 85.3, 27.7, 0.9],
  ["Chaulukya Dynasty", 72.0, 23.0, 1.0],
  ["Paramara Kingdom", 76.0, 23.0, 0.8],
  ["Yadava Kingdom", 75.5, 19.5, 1.0],
  ["Kakatiya Kingdom", 79.6, 17.5, 1.0],
  ["Eastern Ganga Dynasty", 85.5, 20.0, 1.0],
  ["Hoysala Kingdom", 76.0, 13.0, 1.0],
  ["Chola Empire", 79.3, 10.8, 1.2],
  ["Pandya Kingdom", 78.0, 9.5, 0.8],
  ["Kingdom of Polonnaruwa", 80.8, 7.9, 1.0],
  ["Sultanate of the Maldives", 73.5, 4.2, 0.6],
  ["Soomra Dynasty", 68.5, 25.5, 1.0],
  // South-east Asia and the islands.
  ["Khmer Empire", 104.0, 13.4, 1.4],
  ["Kingdom of Champa", 108.5, 13.5, 0.9],
  ["Dai Viet", 105.8, 21.0, 1.1],
  ["Pagan Kingdom", 95.0, 21.2, 1.2],
  ["Kingdom of Hariphunchai", 99.0, 18.6, 0.8],
  ["Sukhothai Kingdom", 100.0, 16.5, 0.9],
  ["Kingdom of Lavo", 100.6, 14.8, 0.7],
  ["Tambralinga", 100.0, 8.4, 0.8],
  ["Srivijaya", 104.0, -2.5, 1.3],
  ["Kingdom of Melayu", 101.5, 0.5, 0.8],
  ["Kingdom of Kediri", 112.0, -7.8, 1.1],
  ["Kingdom of Sunda", 107.0, -6.8, 0.8],
  ["Kingdom of Bali", 115.2, -8.4, 0.6],
  ["Kingdom of Brunei", 114.5, 4.5, 1.1],
  ["Kingdom of Kutai", 116.5, 0.0, 0.9],
  ["Kingdom of Tondo", 121.0, 14.8, 1.0],
  ["Rajahnate of Butuan", 125.5, 8.9, 0.9],
  ["Kingdom of Luwu", 120.3, -3.0, 0.9],
  ["Sultanate of Ternate", 127.5, 0.8, 0.9],
  ["Papuan Clans", 141.0, -5.5, 1.3],
  // Oceania.
  ["Noongar Nations", 117.5, -32.0, 1.2],
  ["Yamatji Nations", 117.0, -25.5, 1.1],
  ["Arrernte Nations", 133.5, -23.8, 1.3],
  ["Yolngu Nations", 135.5, -13.0, 1.1],
  ["Wiradjuri Nations", 147.5, -33.0, 1.1],
  ["Kulin Nations", 144.8, -37.5, 0.9],
  ["Murri Nations", 146.0, -24.0, 1.1],
  ["Kaurna Nations", 138.5, -34.5, 0.8],
  ["Palawa Nations", 146.5, -42.0, 0.8],
  ["Kalkadoon Nations", 140.0, -20.5, 0.9],
  ["Iwi of Aotearoa", 175.5, -39.0, 1.2],
  ["Ngai Tahu", 170.5, -44.5, 0.9],
  ["Tui Tonga Empire", -175.0, -21.0, 1.0],
  ["Kingdom of Hawaii", -156.0, 20.0, 1.0],
  // North America.
  ["Cahokia", -90.0, 38.6, 1.3],
  ["Mississippian Chiefdoms", -87.0, 33.5, 1.2],
  ["Caddo Confederacy", -94.5, 32.5, 0.9],
  ["Haudenosaunee", -76.0, 43.0, 1.2],
  ["Wabanaki Confederacy", -68.5, 45.5, 0.9],
  ["Powhatan Chiefdom", -77.0, 37.5, 0.8],
  ["Anishinaabe", -86.0, 47.0, 1.1],
  ["Cree Nations", -90.0, 54.0, 1.4],
  ["Innu Nations", -67.0, 53.0, 1.2],
  ["Thule Inuit", -85.0, 66.0, 1.5],
  ["Greenland Norse", -47.0, 61.5, 1.2],
  ["Dene Nations", -118.0, 62.0, 1.4],
  ["Tlingit Clans", -134.5, 58.0, 1.0],
  ["Haida Nation", -132.0, 53.5, 0.7],
  ["Salish Peoples", -122.5, 48.0, 0.9],
  ["Aleut Peoples", -160.0, 57.0, 1.0],
  ["Yupik Peoples", -160.0, 62.5, 1.1],
  ["Blackfoot Confederacy", -112.0, 50.5, 1.1],
  ["Oceti Sakowin", -100.0, 45.0, 1.2],
  ["Shoshone Bands", -114.0, 42.0, 1.0],
  ["Chumash Peoples", -120.0, 35.0, 0.9],
  ["Ancestral Puebloans", -108.0, 36.0, 1.2],
  ["Hohokam", -112.0, 33.0, 0.9],
  ["Comanche Bands", -101.0, 34.5, 1.0],
  ["Calusa Kingdom", -81.8, 26.5, 0.8],
  ["Timucua Chiefdoms", -82.0, 30.0, 0.7],
  // Mexico, Central America and the Caribbean.
  ["Aztec Empire", -99.1, 19.4, 1.4],
  ["Tarascan Kingdom", -101.8, 19.6, 0.9],
  ["Toltec Empire", -99.3, 20.1, 0.7],
  ["Mixtec Kingdoms", -97.5, 17.3, 0.9],
  ["Zapotec Kingdoms", -96.4, 16.9, 0.7],
  ["League of Mayapan", -89.5, 20.6, 1.2],
  ["Kingdom of Quiche", -91.1, 15.0, 0.9],
  ["Chichimeca Peoples", -103.5, 25.0, 1.2],
  ["Lenca Chiefdoms", -88.0, 14.0, 0.7],
  ["Chiefdoms of Nicoya", -85.5, 10.5, 0.8],
  ["Taino Chiefdoms", -71.0, 19.0, 1.0],
  ["Chiefdoms of Cuba", -79.0, 22.0, 0.9],
  ["Kalinago", -61.3, 15.0, 0.6],
  // South America.
  ["Inca Empire", -72.0, -13.5, 1.5],
  ["Kingdom of Chimor", -79.0, -8.1, 1.0],
  ["Muisca Confederation", -73.7, 5.3, 1.1],
  ["Tairona Chiefdoms", -74.0, 11.0, 0.8],
  ["Kingdom of Quito", -78.5, -0.3, 0.9],
  ["Aymara Kingdoms", -68.5, -17.0, 1.0],
  ["Chachapoya", -77.8, -6.2, 0.7],
  ["Mapuche Lands", -72.5, -38.5, 1.2],
  ["Diaguita Peoples", -67.0, -28.0, 1.0],
  ["Tehuelche Bands", -69.0, -46.0, 1.3],
  ["Guarani Peoples", -56.0, -25.0, 1.2],
  ["Tupi Peoples", -40.0, -12.0, 1.3],
  ["Marajoara Chiefdoms", -50.0, -1.0, 1.0],
  ["Tapajos Chiefdoms", -55.0, -3.0, 1.0],
  ["Omagua Chiefdoms", -67.0, -3.5, 1.1],
  ["Arawak Peoples", -60.0, 6.0, 1.0],
  ["Carib Peoples", -64.5, 9.5, 0.9],
  ["Ge Peoples", -48.0, -15.0, 1.2],
  ["Charrua Peoples", -56.5, -32.5, 0.9],
  ["Xingu Peoples", -54.0, -11.0, 1.1],
  // The far north and the uttermost south.
  ["Naukan Yupik", -172.0, 65.5, 1.3],
  ["Even Clans", 135.0, 69.0, 1.1],
  ["Arctic Dorset", -118.0, 74.0, 1.0],
  ["Nganasan Clans", 95.0, 73.5, 1.2],
  ["Dolgan Clans", 106.0, 72.0, 1.0],
  ["Yukaghir Clans", 142.0, 70.0, 1.3],
  ["Copper Inuit", -113.0, 70.0, 1.1],
  ["Netsilik Inuit", -94.0, 68.5, 1.0],
  ["Inuvialuit", -133.0, 69.5, 0.9],
  ["Baffin Inuit", -72.0, 70.0, 1.1],
  ["Tuniit", -82.0, 79.0, 1.4],
  ["Kalaallit", -45.0, 70.0, 1.4],
  ["Terra Australis", 70.0, -77.0, 2.5],
  ["Land of the Antipodes", -80.0, -79.0, 2.5],
  ["The Uttermost South", 150.0, -75.0, 2.5],
  ["Ultima Thule of the South", -10.0, -76.0, 2.5],
];

interface Chart {
  /** Tile x and y for a longitude and latitude. */
  place(lon: number, lat: number): [number, number];
  /** How far from its seat, in tiles, a realm may lend its name. */
  reach: number;
  realms: Realm[];
}

/** Earth's latitudes are squeezed towards the poles: degrees to tiles north of the equator. */
const EARTH_LAT: [number, number][] = [
  [-90, -480], [-60, -340], [-34.8, -208], [0, 0], [14.7, 88], [36.1, 203], [60, 350], [71, 391], [90, 470],
];
function earthY(lat: number): number {
  for (let i = 1; i < EARTH_LAT.length; i++) {
    const [a, ya] = EARTH_LAT[i - 1];
    const [b, yb] = EARTH_LAT[i];
    if (lat <= b) return 494 - (ya + ((lat - a) / (b - a)) * (yb - ya));
  }
  return 24;
}

// How each map lies on the globe, read off its coastline (Gibraltar, Cyprus,
// Crete, Iceland, the capes of Africa).
const CHARTS: Partial<Record<GameMapType, Chart>> = {
  [GameMapType.Europe]: { place: (lon, lat) => [495 + lon * 20.6, 1442 - lat * 20.2], reach: 170, realms: WEST },
  [GameMapType.Mediterranean]: { place: (lon, lat) => [273 + lon * 27.7, 1761 - lat * 36.7], reach: 180, realms: WEST },
  [GameMapType.Greece]: { place: (lon, lat) => [-2773 + lon * 128, 6626 - lat * 162], reach: 240, realms: WEST },
  [GameMapType.Earth]: {
    place: (lon, lat) => {
      // The map is cut in the Pacific a little east of the date line.
      let x = 966 + lon * 5.62;
      if (x < 0) x += 2054;
      return [x, earthY(lat)];
    },
    reach: 85,
    realms: [...WEST, ...WORLD],
  },
};

/**
 * A real name for each seat, or null where none fits. Pairs of seat and
 * realm are taken closest first, so each realm goes to the seat nearest it
 * and no name is used twice.
 */
export function historicNames(map: GameMapType, seats: readonly [number, number][], w: number, h: number): (string | null)[] {
  const out: (string | null)[] = seats.map(() => null);
  const chart = CHARTS[map];
  if (!chart) return out;
  const pairs: [score: number, seat: number, realm: number][] = [];
  chart.realms.forEach(([, lon, lat, weight = 1], r) => {
    const [x, y] = chart.place(lon, lat);
    // Well off the map: not a candidate here. (A realm centred just past the edge still is.)
    if (x < -90 || y < -90 || x > w + 90 || y > h + 90) return;
    seats.forEach(([sx, sy], s) => {
      const d = Math.hypot(sx - x, sy - y);
      if (d <= chart.reach * weight) pairs.push([d / weight, s, r]);
    });
  });
  // Ties broken by index, so the order never depends on the sort.
  pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const used = new Set<number>();
  for (const [, s, r] of pairs) {
    if (out[s] !== null || used.has(r)) continue;
    out[s] = chart.realms[r][0];
    used.add(r);
  }
  return out;
}
