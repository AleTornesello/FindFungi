export type Edibility = "edible" | "caution" | "inedible" | "toxic" | "deadly"

export interface Species {
  id: string
  commonName: string
  latinName: string
  edibility: Edibility
  /** Months the species usually fruits, 1 = January. */
  months: number[]
  habitat: string
  capColor: string
  stemColor: string
  spots?: boolean
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]

export const EDIBILITY: Record<Edibility, { label: string; palette: string }> = {
  edible: { label: "Edible", palette: "moss" },
  caution: { label: "Edible with care", palette: "chanterelle" },
  inedible: { label: "Not edible", palette: "soil" },
  toxic: { label: "Toxic", palette: "red" },
  deadly: { label: "Deadly", palette: "red" },
}

export const SPECIES: Species[] = [
  {
    id: "chanterelle",
    commonName: "Chanterelle",
    latinName: "Cantharellus cibarius",
    edibility: "edible",
    months: [6, 7, 8, 9, 10],
    habitat: "Mossy ground under oak, beech and conifers",
    capColor: "#E8A33D",
    stemColor: "#F2B955",
  },
  {
    id: "porcini",
    commonName: "Porcini",
    latinName: "Boletus edulis",
    edibility: "edible",
    months: [8, 9, 10, 11],
    habitat: "Under spruce, pine, birch and oak",
    capColor: "#8A5A34",
    stemColor: "#E9D9C8",
  },
  {
    id: "fly-agaric",
    commonName: "Fly agaric",
    latinName: "Amanita muscaria",
    edibility: "toxic",
    months: [8, 9, 10, 11],
    habitat: "Near birch and pine, often in rings",
    capColor: "#E0533A",
    stemColor: "#F6EFE8",
    spots: true,
  },
  {
    id: "death-cap",
    commonName: "Death cap",
    latinName: "Amanita phalloides",
    edibility: "deadly",
    months: [7, 8, 9, 10, 11],
    habitat: "Under oak and other broadleaf trees",
    capColor: "#A9B26A",
    stemColor: "#F3F6EA",
  },
  {
    id: "chicken-of-the-woods",
    commonName: "Chicken of the woods",
    latinName: "Laetiporus sulphureus",
    edibility: "caution",
    months: [5, 6, 7, 8, 9, 10],
    habitat: "Shelves on living or dead oak, cherry and willow",
    capColor: "#F2B955",
    stemColor: "#DDEC8E",
  },
  {
    id: "parasol",
    commonName: "Parasol",
    latinName: "Macrolepiota procera",
    edibility: "edible",
    months: [7, 8, 9, 10, 11],
    habitat: "Grassy woodland edges and clearings",
    capColor: "#B58962",
    stemColor: "#D2B395",
    spots: true,
  },
  {
    id: "morel",
    commonName: "Morel",
    latinName: "Morchella esculenta",
    edibility: "caution",
    months: [3, 4, 5],
    habitat: "Disturbed ground, old orchards, ash and elm",
    capColor: "#96663E",
    stemColor: "#F6EFE8",
  },
  {
    id: "turkey-tail",
    commonName: "Turkey tail",
    latinName: "Trametes versicolor",
    edibility: "inedible",
    months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    habitat: "Tiered brackets on dead hardwood",
    capColor: "#5E8C31",
    stemColor: "#7A4E2D",
  },
]
