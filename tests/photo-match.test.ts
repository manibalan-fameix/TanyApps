import { describe, expect, it } from "vitest"

import { matchPhotos, photoWords } from "@/lib/restaurant/photo-match"

const products = ["Amul Butter 100g", "Amul Butter 500g", "Amul Taaza Milk 500ml", "Sugar 1kg", "Farm Eggs Tray 30", "Dettol Soap 3x125g"].map((name, i) => ({ id: String(i), name }))
const one = (file: string) => matchPhotos([file], products)[0]

describe("matching photo files to products", () => {
  it("reads names however the file is written", () => {
    expect(photoWords("Amul_Butter-100 GM (1).JPG")).toEqual(["amul", "butter", "100g"])
    expect(one("amul-butter-100g.jpg")).toBe("0")
    expect(one("Amul Taaza Milk 500 ML.png")).toBe("2")
    expect(one("dettol_soap_3x125g.webp")).toBe("5")
    expect(one("farm eggs tray 30.jpeg")).toBe("4")
  })
  it("accepts a name without the size only when one product fits", () => {
    expect(one("sugar.jpg")).toBe("3")
    expect(one("amul butter.jpg")).toBeNull()
  })
  it("never puts one size's photo on another", () => {
    expect(one("amul butter 200g.jpg")).toBeNull()
    expect(one("sugar 5kg.jpg")).toBeNull()
  })
  it("leaves unrelated and camera file names for the owner", () => {
    expect(one("IMG_4821.jpg")).toBeNull()
    expect(one("butter.jpg")).toBeNull()
  })
  it("gives a product to one file only", () => {
    expect(matchPhotos(["sugar.jpg", "Sugar 1kg.png"], products)).toEqual(["3", null])
  })
})
