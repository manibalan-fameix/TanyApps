/**
 * The kinds of shop a TanyRetail business can be. Asked in onboarding, stored on `dealers.business_type`, and used to pick the
 * words the admin and the public page use, the starter categories, and the units a product is sold in. Plain data so it can be
 * imported from the server, the browser and the proxy.
 */

export const RETAIL_TYPE_KEYS = ["grocery", "supermarket", "textile", "hardware", "electronics", "stationery", "general"] as const
export type RetailTypeKey = (typeof RETAIL_TYPE_KEYS)[number]

export const DEFAULT_RETAIL_TYPE: RetailTypeKey = "general"

export type RetailType = {
  key: RetailTypeKey
  label: string
  /** One line on the onboarding card. */
  blurb: string
  /** Examples shown under the label, so owners recognise themselves. */
  examples: string
  /** Placeholder shop name in onboarding and the preview. */
  namePlaceholder: string
  /** Singular and plural for one thing the shop sells, lower case: "product", "item". */
  item: string
  items: string
  /** What the shop's range is called, title case: "Catalogue", "Stock". */
  catalogue: string
  /** Categories created for a new shop so the catalogue is not empty. */
  starterCategories: readonly string[]
  /** Units a product can be sold in, first is the default. Shown as the portion label (for example "1 kg", "per metre"). */
  units: readonly string[]
  /** Sample product shown in the onboarding preview. */
  previewItems: readonly { name: string; price: string }[]
  /** Whether customers expect a diet mark (veg / non-veg) on products. Only food shops. */
  dietMarks: boolean
  /** Text for the search box on the public page. */
  searchHint: string
  /** Suggested one-line tagline for the public page. */
  tagline: string
}

export const RETAIL_TYPES: Record<RetailTypeKey, RetailType> = {
  grocery: {
    key: "grocery",
    label: "Grocery / Kirana store",
    blurb: "Daily groceries, staples and household items, delivered or picked up.",
    examples: "Kirana, provision store, fruits and vegetables",
    namePlaceholder: "Sri Murugan Stores",
    item: "product",
    items: "products",
    catalogue: "Catalogue",
    starterCategories: ["Rice & Grains", "Oils & Ghee", "Pulses & Dals", "Spices & Masalas", "Snacks & Biscuits", "Beverages", "Dairy & Eggs", "Fruits & Vegetables", "Household & Cleaning", "Personal Care"],
    units: ["1 kg", "500 g", "250 g", "1 litre", "500 ml", "1 pack", "1 piece", "1 dozen"],
    previewItems: [{ name: "Ponni rice 5 kg", price: "₹349" }, { name: "Sunflower oil 1 L", price: "₹142" }, { name: "Toor dal 1 kg", price: "₹168" }, { name: "Tea powder 250 g", price: "₹120" }],
    dietMarks: true,
    searchHint: "Search rice, oil, soap...",
    tagline: "Fresh groceries from your neighbourhood store",
  },
  supermarket: {
    key: "supermarket",
    label: "Supermarket / Hypermarket",
    blurb: "Large stores with many departments, brands and offers.",
    examples: "Supermarket, hypermarket, mini mart, wholesale",
    namePlaceholder: "Annai Super Market",
    item: "product",
    items: "products",
    catalogue: "Catalogue",
    starterCategories: ["Fresh Produce", "Dairy & Bakery", "Staples & Grains", "Packaged Foods", "Snacks & Beverages", "Frozen & Ready to Eat", "Personal Care", "Home & Cleaning", "Baby Care", "Kitchen & Home Needs"],
    units: ["1 piece", "1 pack", "1 kg", "500 g", "1 litre", "Pack of 2", "Pack of 6", "Box"],
    previewItems: [{ name: "Full cream milk 1 L", price: "₹68" }, { name: "Brown bread", price: "₹45" }, { name: "Basmati rice 5 kg", price: "₹620" }, { name: "Dishwash liquid", price: "₹199" }],
    dietMarks: true,
    searchHint: "Search products, brands...",
    tagline: "Everything for your home under one roof",
  },
  textile: {
    key: "textile",
    label: "Textile / Garments shop",
    blurb: "Sarees, dress materials, readymade clothes and fabrics by the metre.",
    examples: "Saree shop, readymade garments, fabrics, uniforms",
    namePlaceholder: "Kalyani Textiles",
    item: "item",
    items: "items",
    catalogue: "Collection",
    starterCategories: ["Sarees", "Churidar Materials", "Men's Wear", "Women's Wear", "Kids Wear", "Fabrics (per metre)", "Innerwear", "Bedsheets & Furnishing", "Uniforms"],
    units: ["1 piece", "per metre", "Set", "Pair", "6 metres", "2.5 metres"],
    previewItems: [{ name: "Kanchipuram silk saree", price: "₹4,500" }, { name: "Cotton shirt", price: "₹699" }, { name: "Dress material set", price: "₹1,250" }, { name: "Cotton fabric / metre", price: "₹180" }],
    dietMarks: false,
    searchHint: "Search sarees, shirts, fabrics...",
    tagline: "Fabrics and fashion for every occasion",
  },
  hardware: {
    key: "hardware",
    label: "Hardware shop",
    blurb: "Tools, plumbing, electricals, paint and building materials.",
    examples: "Hardware, plumbing, electricals, paints, building materials",
    namePlaceholder: "Raja Hardware & Paints",
    item: "product",
    items: "products",
    catalogue: "Catalogue",
    starterCategories: ["Hand Tools", "Power Tools", "Plumbing", "Electricals", "Paints & Brushes", "Fasteners & Fittings", "Cement & Building Materials", "Locks & Security", "Safety Gear"],
    units: ["1 piece", "1 kg", "1 box", "1 metre", "1 litre", "Pack of 10", "1 set", "1 bag"],
    previewItems: [{ name: "Claw hammer", price: "₹280" }, { name: "PVC pipe 1 inch / m", price: "₹95" }, { name: "Wall paint 4 L", price: "₹1,350" }, { name: "Cement bag 50 kg", price: "₹395" }],
    dietMarks: false,
    searchHint: "Search tools, pipes, paint...",
    tagline: "Tools and materials for every job",
  },
  electronics: {
    key: "electronics",
    label: "Electronics & Mobiles",
    blurb: "Phones, appliances, accessories and gadgets with warranty.",
    examples: "Mobile shop, appliances, computers, accessories",
    namePlaceholder: "Sri Ganesh Mobiles",
    item: "product",
    items: "products",
    catalogue: "Catalogue",
    starterCategories: ["Mobile Phones", "Accessories", "Chargers & Cables", "Audio", "Televisions", "Home Appliances", "Laptops & Computers", "Small Appliances"],
    units: ["1 piece", "1 set", "Pack of 2"],
    previewItems: [{ name: "Smartphone 6 GB / 128 GB", price: "₹13,999" }, { name: "Fast charger 33 W", price: "₹799" }, { name: "Bluetooth earbuds", price: "₹1,499" }, { name: "Mixer grinder", price: "₹3,250" }],
    dietMarks: false,
    searchHint: "Search phones, chargers, TVs...",
    tagline: "Genuine gadgets with warranty",
  },
  stationery: {
    key: "stationery",
    label: "Stationery & Gifts",
    blurb: "Books, school supplies, office items and gifts.",
    examples: "Stationery, books, toys, gift shop",
    namePlaceholder: "Bharathi Stationery",
    item: "product",
    items: "products",
    catalogue: "Catalogue",
    starterCategories: ["Notebooks & Paper", "Pens & Pencils", "School Supplies", "Art & Craft", "Office Supplies", "Books", "Toys", "Gifts"],
    units: ["1 piece", "Pack of 5", "Pack of 10", "1 dozen", "1 set", "1 ream"],
    previewItems: [{ name: "Ruled notebook 200 pg", price: "₹60" }, { name: "Gel pens (10)", price: "₹90" }, { name: "A4 paper ream", price: "₹320" }, { name: "Geometry box", price: "₹110" }],
    dietMarks: false,
    searchHint: "Search notebooks, pens, gifts...",
    tagline: "Everything for school, office and gifting",
  },
  general: {
    key: "general",
    label: "Other retail shop",
    blurb: "Any other shop that sells products to walk-in and online customers.",
    examples: "Footwear, jewellery, furniture, pet supplies and more",
    namePlaceholder: "Your Shop Name",
    item: "product",
    items: "products",
    catalogue: "Catalogue",
    starterCategories: ["New Arrivals", "Best Sellers", "Offers"],
    units: ["1 piece", "1 pack", "1 set", "1 kg"],
    previewItems: [{ name: "Featured product", price: "₹499" }, { name: "Best seller", price: "₹299" }, { name: "New arrival", price: "₹899" }, { name: "Gift set", price: "₹1,199" }],
    dietMarks: false,
    searchHint: "Search products...",
    tagline: "Shop our full range online",
  },
}

export const retailTypeList: RetailType[] = RETAIL_TYPE_KEYS.map((k) => RETAIL_TYPES[k])

export const isRetailType = (v: unknown): v is RetailTypeKey => typeof v === "string" && (RETAIL_TYPE_KEYS as readonly string[]).includes(v)

/** The retail type for a stored value; anything unknown (older rows, a typo) is the general shop. */
export function getRetailType(key: string | null | undefined): RetailType {
  return isRetailType(key) ? RETAIL_TYPES[key] : RETAIL_TYPES[DEFAULT_RETAIL_TYPE]
}
