// The picture for a category: a hugeicons icon on one of the Tany product colours, chosen from the category's name. The store and the
// admin both use this, so a category looks the same everywhere, and a new one gets an icon without anyone picking it.
import {
  Baby01Icon,
  BedIcon,
  BiscuitIcon,
  BodySoapIcon,
  Bone01Icon,
  BookOpen01Icon,
  Bread01Icon,
  Briefcase01Icon,
  CakeSliceIcon,
  CandyIcon,
  CarrotIcon,
  ChickenThighsIcon,
  CleaningBucketIcon,
  Coffee01Icon,
  CookieIcon,
  CookingPotIcon,
  DiscountTag01Icon,
  Dress01Icon,
  DropletIcon,
  EggFriedIcon,
  FishIcon,
  GiftIcon,
  Grid02Icon,
  HammerIcon,
  HeadphonesIcon,
  IceCreamConeIcon,
  KitchenUtensilsIcon,
  LaptopIcon,
  MilkCartonIcon,
  NoodlesIcon,
  Notebook01Icon,
  Package01Icon,
  PaintBrush01Icon,
  PaintBoardIcon,
  PencilIcon,
  PepperIcon,
  Pizza01Icon,
  Plug01Icon,
  RiceBowl01Icon,
  SaladIcon,
  SandwichIcon,
  Shield01Icon,
  Shirt01Icon,
  SmartPhone01Icon,
  SoftDrink01Icon,
  SoupIcon,
  SparklesIcon,
  SpoonAndForkIcon,
  StarIcon,
  ToyBrickIcon,
  Tv01Icon,
  WashingMachineIcon,
  WheatIcon,
  Wrench01Icon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

/** Names of the colour pairs in app/globals.css (--ground-* and --logo-*). */
export type CategoryColour = "tanyeats" | "tanymotos" | "tanycabs" | "tanyecom" | "tanyretail" | "tanygaming" | "tanygarage" | "tanymeat" | "tanymeds" | "tanysalon" | "tanysport" | "tanyexpert"

type Look = { icon: IconSvgElement; colour: CategoryColour }

/** First match wins, so the more particular words come first ("Baby Care" before "Care", "Kitchen & Home" before "Home"). */
const RULES: [RegExp, IconSvgElement, CategoryColour][] = [
  // groceries and food
  [/\bbaby|infant|diaper/, Baby01Icon, "tanycabs"],
  [/fruit|vegetable|\bveggies?\b|produce|greens/, CarrotIcon, "tanysport"],
  [/dairy|milk|paneer|cheese/, MilkCartonIcon, "tanyretail"],
  [/\beggs?\b|breakfast|tiffin|dosa|idli/, EggFriedIcon, "tanymotos"],
  [/ice ?cream|frozen|ready to eat/, IceCreamConeIcon, "tanygaming"],
  [/snacks?.*(beverage|drink)|(beverage|drink).*snacks?/, SoftDrink01Icon, "tanymotos"],
  [/biscuit/, BiscuitIcon, "tanymotos"],
  [/snack|namkeen|chips|starter|appeti[sz]er|chaat/, CookieIcon, "tanymotos"],
  [/coffee|\btea\b|chai/, Coffee01Icon, "tanygarage"],
  [/beverage|drink|juice|soda|shake|mocktail/, SoftDrink01Icon, "tanymeat"],
  [/\boils?\b|ghee/, DropletIcon, "tanymotos"],
  [/spice|masala|pickle|condiment|chutney/, PepperIcon, "tanymeat"],
  [/pulse|\bdals?\b|lentil|soup/, SoupIcon, "tanygarage"],
  [/biryani|\brice\b|pulao|meals?\b|thali|combo/, RiceBowl01Icon, "tanymotos"],
  [/staple|grain|flour|atta|cereal/, WheatIcon, "tanygarage"],
  [/bakery|bread|\bbuns?\b|roti|naan|paratha/, Bread01Icon, "tanygarage"],
  [/dessert|cake|pastry|pastries/, CakeSliceIcon, "tanycabs"],
  [/sweet|mithai|chocolate|candy/, CandyIcon, "tanycabs"],
  [/fish|sea ?food|prawn/, FishIcon, "tanygaming"],
  [/chicken|poultry|tandoori|kebab|grill/, ChickenThighsIcon, "tanymeat"],
  [/mutton|\bmeat\b|non[- ]?veg/, Bone01Icon, "tanymeat"],
  [/pizza/, Pizza01Icon, "tanymeat"],
  [/burger|sandwich|wrap|roll/, SandwichIcon, "tanymotos"],
  [/noodle|chinese|pasta/, NoodlesIcon, "tanymotos"],
  [/salad|healthy|vegan/, SaladIcon, "tanysport"],
  [/packaged|grocery|instant|canned/, Package01Icon, "tanyecom"],
  // home and care
  [/clean|detergent|laundry|household/, CleaningBucketIcon, "tanymeds"],
  [/personal|beauty|cosmetic|skin|hair|care\b/, BodySoapIcon, "tanysalon"],
  [/kitchen|utensil|cookware/, KitchenUtensilsIcon, "tanyeats"],
  // clothes and furnishing
  [/saree|churidar|women|ladies|dress/, Dress01Icon, "tanycabs"],
  [/\bmen'?s?\b|\bkids?\b|uniform|innerwear|shirt|clothing|fabric/, Shirt01Icon, "tanyretail"],
  [/bed|furnish|linen/, BedIcon, "tanyecom"],
  // hardware
  [/power tool|electric|charger|cable|accessor/, Plug01Icon, "tanymotos"],
  [/plumb|pipe/, DropletIcon, "tanygaming"],
  [/paint|brush/, PaintBrush01Icon, "tanyexpert"],
  [/fasten|fitting|cement|building/, HammerIcon, "tanygarage"],
  [/lock|safety|security/, Shield01Icon, "tanyretail"],
  [/tool|hardware/, Wrench01Icon, "tanygarage"],
  // electronics
  [/mobile|phone/, SmartPhone01Icon, "tanyecom"],
  [/audio|headphone|speaker/, HeadphonesIcon, "tanyexpert"],
  [/televis|\btvs?\b/, Tv01Icon, "tanyretail"],
  [/laptop|computer/, LaptopIcon, "tanygaming"],
  [/appliance/, WashingMachineIcon, "tanymeds"],
  // stationery and gifts
  [/notebook|paper/, Notebook01Icon, "tanyretail"],
  [/\bpens?\b|pencil|school|stationery/, PencilIcon, "tanymotos"],
  [/\bart\b|craft/, PaintBoardIcon, "tanyexpert"],
  [/office/, Briefcase01Icon, "tanygarage"],
  [/book/, BookOpen01Icon, "tanyeats"],
  [/toy|game/, ToyBrickIcon, "tanygaming"],
  [/gift/, GiftIcon, "tanycabs"],
  [/new arrival|\bnew\b/, SparklesIcon, "tanyecom"],
  [/best|popular|special|recommended/, StarIcon, "tanymotos"],
  [/offer|deal|discount|sale/, DiscountTag01Icon, "tanymeat"],
  // general words, last
  [/home|decor/, CookingPotIcon, "tanymeds"],
  [/main course|\bmains\b|curry|curries|gravy|\bfood/, SpoonAndForkIcon, "tanyeats"],
]

export function categoryLook(name: string): Look {
  const text = name.toLowerCase().replace(/[’]/g, "'")
  const hit = RULES.find(([words]) => words.test(text))
  return hit ? { icon: hit[1], colour: hit[2] } : { icon: Grid02Icon, colour: "tanyecom" }
}
