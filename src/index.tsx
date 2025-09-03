/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type } from "@google/genai";
import JSZip from "jszip";

// --- Type Definitions ---
interface ColorScheme {
  black: string;
  red: string;
  green: string;
  yellow: string;
  blue: string;
  magenta: string;
  cyan: string;
  white: string;
}

interface FullTheme {
  primary: {
    background: string;
    foreground: string;
  };
  normal: ColorScheme;
  bright: ColorScheme;
  accent: string;
}

// --- DOM Elements ---
const form = document.getElementById("prompt-form") as HTMLFormElement;
const input = document.getElementById("prompt-input") as HTMLInputElement;
const imageUploadInput = document.getElementById(
  "image-upload"
) as HTMLInputElement;
const imagePreviewContainer = document.getElementById(
  "image-preview-container"
) as HTMLDivElement;
const imagePreview = document.getElementById(
  "image-preview"
) as HTMLImageElement;
const removeImageButton = document.getElementById(
  "remove-image-button"
) as HTMLButtonElement;
const button = document.getElementById("generate-button") as HTMLButtonElement;
const loader = document.getElementById("loader") as HTMLDivElement;
const paletteContainer = document.getElementById(
  "palette-container"
) as HTMLElement;
const errorContainer = document.getElementById(
  "error-container"
) as HTMLDivElement;
const downloadContainer = document.getElementById(
  "download-container"
) as HTMLDivElement;
const downloadButton = document.getElementById(
  "download-button"
) as HTMLButtonElement;
const buttonText = button.querySelector("span");
const iconThemeSelect = document.getElementById(
  "icon-theme-select"
) as HTMLSelectElement;

// --- App State ---
let uploadedImage: { data: string; mimeType: string; name: string } | null =
  null;
let currentTheme: FullTheme | null = null;

// --- Gemini AI Setup ---
const API_KEY = import.meta.env.VITE_API_KEY;
if (!API_KEY) {
  showError("API key is missing. Please set the API_KEY environment variable.");
  throw new Error("VITE_API_KEY is not defined in the .env file");
}
const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * Shows an error message in the UI.
 * @param message The error message to display.
 */
function showError(message: string) {
  errorContainer.textContent = message;
  errorContainer.style.display = "block";
  paletteContainer.innerHTML = "";
  downloadContainer.style.display = "none";
}

/**
 * Sets the loading state of the UI.
 * @param isLoading - Whether the app is currently loading.
 */
function setLoading(isLoading: boolean) {
  if (isLoading) {
    loader.style.display = "block";
    button.disabled = true;
    if (buttonText) buttonText.textContent = "Generating...";
    errorContainer.style.display = "none";
    downloadContainer.style.display = "none";
    iconThemeSelect.disabled = true; // Disable dropdown during generation
    // iconThemeSelect.innerHTML = '<option value="">Generating...</option>'; // Removed: Do not clear options
  } else {
    loader.style.display = "none";
    button.disabled = false;
    if (buttonText) buttonText.textContent = "Generate";
    iconThemeSelect.disabled = false; // Enable dropdown after generation
  }
}

/**
 * Determines if text should be light or dark based on background hex color.
 * @param hex - The hex color string (e.g., "#RRGGBB").
 * @returns 'light' or 'dark'.
 */
function getTextColor(hex: string): "light" | "dark" {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.5 ? "dark" : "light";
}

/**
 * Copies text to the clipboard and provides user feedback.
 * @param text The text to copy.
 * @param element The element that was clicked.
 */
async function copyToClipboard(text: string, element: HTMLElement) {
  try {
    await navigator.clipboard.writeText(text);
    const originalText = element.textContent;
    element.textContent = "Copied!";
    setTimeout(() => {
      element.textContent = originalText;
    }, 1500);
  } catch (err) {
    console.error("Failed to copy text: ", err);
  }
}

/**
 * Displays the generated color palette in the UI.
 * @param theme - The Full theme object.
 */
function displayPalette(theme: FullTheme) {
  paletteContainer.innerHTML = "";
  if (!theme?.normal) {
    showError("The AI did not return a valid theme. Please try again.");
    return;
  }

  // Display the 8 "normal" colors as the main palette preview
  const colors = Object.values(theme.normal);

  colors.forEach((color) => {
    const swatch = document.createElement("div");
    swatch.classList.add("color-swatch");
    swatch.style.backgroundColor = color;
    swatch.setAttribute("role", "button");
    swatch.setAttribute("tabindex", "0");
    swatch.setAttribute("aria-label", `Copy color ${color}`);

    const hexValue = document.createElement("span");
    hexValue.textContent = color.toUpperCase();
    hexValue.classList.add("hex-value");
    hexValue.classList.add(getTextColor(color)); // for contrast

    swatch.appendChild(hexValue);
    paletteContainer.appendChild(swatch);

    const handleClickAndKey = () => copyToClipboard(color, hexValue);

    swatch.addEventListener("click", handleClickAndKey);
    swatch.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleClickAndKey();
      }
    });
  });

  downloadContainer.style.display = "flex";
}

/**
 * Handles the selection of an image file.
 * @param event - The change event from the file input.
 */
function handleImageUpload(event: Event) {
  const target = event.target as HTMLInputElement;
  const file = target.files?.[0];

  if (file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const result = e.target?.result as string;
      const [mimeTypePart, base64Data] = result.split(";base64,");

      uploadedImage = {
        data: base64Data,
        mimeType: mimeTypePart.split(":")[1],
        name: file.name,
      };

      imagePreview.src = result;
      imagePreviewContainer.style.display = "block";
      input.placeholder = "Describe details to focus on (optional)";
    };
    reader.readAsDataURL(file);
  }
}

/**
 * Clears the currently selected image.
 */
function clearImage() {
  uploadedImage = null;
  imageUploadInput.value = "";
  imagePreview.src = "";
  imagePreviewContainer.style.display = "none";
  input.placeholder = "e.g., a serene beach at sunset";
}

/**
 * Lightens a hex color by a given percentage amount.
 * @param hex The hex color string (e.g., "#RRGGBB").
 * @param amount The percentage to lighten (0-100).
 * @returns The new, lighter hex color string.
 */
function lightenHexColor(hex: string, amount: number): string {
  let color = hex.startsWith("#") ? hex.slice(1) : hex;
  const num = parseInt(color, 16);
  let r = num >> 16;
  let g = (num >> 8) & 0x00ff;
  let b = num & 0x0000ff;
  r = Math.round(Math.min(255, r + (255 - r) * (amount / 100)));
  g = Math.round(Math.min(255, g + (255 - g) * (amount / 100)));
  b = Math.round(Math.min(255, b + (255 - b) * (amount / 100)));
  const newHex = ((r << 16) | (g << 8) | b).toString(16).padStart(6, "0");
  return `#${newHex}`;
}

/**
 * Converts a hex color string to an RGBA string.
 * @param hex The hex color string (e.g., "#RRGGBB").
 * @param alpha The alpha transparency value (0.0 to 1.0).
 * @returns The RGBA color string.
 */
function hexToRgba(hex: string, alpha: number = 1.0): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return `rgba(0,0,0,${alpha})`; // Fallback
  const r = parseInt(result[1], 16);
  const g = parseInt(result[2], 16);
  const b = parseInt(result[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// --- Helper Functions for Color Naming ---

/**
 * Converts a hex color string to an RGB object.
 * @param hex The hex color string (e.g., "#RRGGBB").
 * @returns An object with r, g, b properties.
 */
function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

/**
 * Calculates the Euclidean distance between two RGB colors.
 * @param rgb1 First RGB color object.
 * @param rgb2 Second RGB color object.
 * @returns The Euclidean distance.
 */
function rgbDistance(
  rgb1: { r: number; g: number; b: number },
  rgb2: { r: number; g: number; b: number }
): number {
  return Math.sqrt(
    Math.pow(rgb1.r - rgb2.r, 2) +
      Math.pow(rgb1.g - rgb2.g, 2) +
      Math.pow(rgb1.b - rgb2.b, 2)
  );
}

// Define a set of common named colors and their hex values
const namedColors: { [key: string]: string } = {
  // Approximate hex values for Yaru colors
  Yaru: "#e95420", // Ubuntu orange
  "Yaru-blue": "#304ffe",
  "Yaru-dark": "#303030", // A dark grey for the dark theme base
  "Yaru-magenta": "#9c27b0",
  "Yaru-olive": "#808000",
  "Yaru-prussiangreen": "#008080",
  "Yaru-purple": "#800080",
  "Yaru-red": "#f44336",
  "Yaru-sage": "#c2b280",
  "Yaru-wartybrown": "#4e342e",
  "Yaru-yellow": "#ffeb3b",
};

/**
 * Populates the icon theme dropdown with available Yaru colors.
 */
function populateIconThemeDropdown() {
  iconThemeSelect.innerHTML = ""; // Clear existing options
  for (const colorName in namedColors) {
    const option = document.createElement("option");
    option.value = colorName; // Use the exact name (e.g., "Yaru-blue")

    const colorSquare = document.createElement("span");
    colorSquare.classList.add("color-square");
    colorSquare.style.backgroundColor = namedColors[colorName];

    // Create a text node for the readable name
    const textNode = document.createTextNode(colorName.replace(/-/g, " "));

    // Append both the color square and the text content to the option.
    // Note: Native <option> elements have limited styling capabilities.
    // The visual rendering of the color square within the dropdown
    // might vary significantly across browsers or might not appear as intended.
    option.appendChild(colorSquare);
    option.appendChild(textNode);

    iconThemeSelect.appendChild(option);
  }
}

/**
 * Finds the closest named color to a given hex color.
 * @param hex The hex color string (e.g., "#RRGGBB").
 * @returns The name of the closest color.
 */
function getClosestNamedColor(hex: string): string {
  const targetRgb = hexToRgb(hex);
  let closestColorName = "black";
  let minDistance = Infinity;

  for (const name in namedColors) {
    const namedHex = namedColors[name];
    const namedRgb = hexToRgb(namedHex);
    const distance = rgbDistance(targetRgb, namedRgb);

    if (distance < minDistance) {
      minDistance = distance;
      closestColorName = name;
    }
  }
  return closestColorName;
}

/**
 * Generates the content for the alacritty.toml file.
 * @param theme - The Full theme object.
 * @returns A string containing the TOML configuration.
 */
function generateAlacrittyThemeFile(theme: FullTheme): string {
  return `
# Alacritty Theme generated by AI Color Palette Generator
# Theme based on: ${input.value.trim() || "uploaded image"}

[colors.primary]
background = '${theme.primary.background}'
foreground = '${theme.primary.foreground}'

[colors.normal]
black   = '${theme.normal.black}'
red     = '${theme.normal.red}'
green   = '${theme.normal.green}'
yellow  = '${theme.normal.yellow}'
blue    = '${theme.normal.blue}'
magenta = '${theme.normal.magenta}'
cyan    = '${theme.normal.cyan}'
white   = '${theme.normal.white}'

[colors.bright]
black   = '${theme.bright.black}'
red     = '${theme.bright.red}'
green   = '${theme.bright.green}'
yellow  = '${theme.bright.yellow}'
blue    = '${theme.bright.blue}'
magenta = '${theme.bright.magenta}'
cyan    = '${theme.bright.cyan}'
white   = '${theme.bright.white}'

# Font configuration (example)
[font]
normal.family = "JetBrainsMono Nerd Font"
size = 14.0
  `.trim();
}

/**
 * Generates the content for the btop.theme file.
 * @param theme - The Full theme object.
 * @returns A string containing the btop theme configuration.
 */
function generateBtopThemeFile(theme: FullTheme): string {
  const promptInfo = input.value.trim() || "uploaded image";
  return `
# Theme generated by AI Color Palette Generator
# Based on: ${promptInfo}

# Main bg
theme[main_bg]="${theme.primary.background}"

# Main text color
theme[main_fg]="${theme.primary.foreground}"

# Title color for boxes
theme[title]="${theme.primary.foreground}"

# Highlight color for keyboard shortcuts
theme[hi_fg]="${theme.normal.blue}"

# Background color of selected item in processes box
theme[selected_bg]="${theme.normal.black}"

# Foreground color of selected item in processes box
theme[selected_fg]="${theme.primary.foreground}"

# Color of inactive/disabled text
theme[inactive_fg]="${theme.bright.black}"

# Misc colors for processes box including mini cpu graphs, details memory graph and details status text
theme[proc_misc]="${theme.normal.blue}"

# Box outline and divider line color
theme[cpu_box]="${theme.bright.black}"
theme[mem_box]="${theme.bright.black}"
theme[net_box]="${theme.bright.black}"
theme[proc_box]="${theme.bright.black}"
theme[div_line]="${theme.bright.black}"

# Graph and meter colors
theme[temp_start]="${theme.normal.green}"
theme[temp_mid]="${theme.normal.yellow}"
theme[temp_end]="${theme.normal.red}"

theme[cpu_start]="${theme.normal.green}"
theme[cpu_mid]="${theme.normal.yellow}"
theme[cpu_end]="${theme.normal.red}"

theme[free_start]="${theme.normal.green}"
theme[free_mid]="${theme.normal.yellow}"
theme[free_end]="${theme.normal.red}"

theme[cached_start]="${theme.normal.green}"
theme[cached_mid]="${theme.normal.yellow}"
theme[cached_end]="${theme.normal.red}"

theme[available_start]="${theme.normal.green}"
theme[available_mid]="${theme.normal.yellow}"
theme[available_end]="${theme.normal.red}"

theme[used_start]="${theme.normal.green}"
theme[used_mid]="${theme.normal.yellow}"
theme[used_end]="${theme.normal.red}"

theme[download_start]="${theme.normal.green}"
theme[download_mid]="${theme.normal.yellow}"
theme[download_end]="${theme.normal.red}"

theme[upload_start]="${theme.normal.green}"
theme[upload_mid]="${theme.normal.yellow}"
theme[upload_end]="${theme.normal.red}"
    `.trim();
}


/**
 * Generates the content for the chromium.theme file.
 * @param theme - The Full theme object.
 * @returns A string containing the chromium theme configuration (RGB).
 */
function generateChromiumThemeFile(theme: FullTheme): string {
  // Helper to convert hex to an RGB string "r,g,b"
  const hexToRgbString = (hex: string): string => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return "0,0,0"; // Fallback to black
    const r = parseInt(result[1], 16);
    const g = parseInt(result[2], 16);
    const b = parseInt(result[3], 16);
    return `${r},${g},${b}`;
  };

  return hexToRgbString(theme.primary.background);
}

/**
 * Generates the content for the hyprland.conf file.
 * @param theme - The Full theme object.
 * @returns A string containing the Hyprland theme snippet.
 */
function generateHyprlandConfFile(theme: FullTheme): string {
  // Helper to format hex color for hyprland (e.g., #RRGGBB -> 0xffRRGGBB)
  const formatHyprlandColor = (hex: string): string => {
    return `0xff${hex.replace("#", "")}`;
  };

  // Use the explicit accent color, with a fallback to blue
  const accentColor = theme.accent || theme.normal.blue;
  const lighterAccentColor = lightenHexColor(accentColor, 20);

  const activeBorderColor1 = formatHyprlandColor(accentColor);
  const activeBorderColor2 = formatHyprlandColor(lighterAccentColor);

  return `
# Hyprland theme snippet generated by AI Color Palette Generator
# Based on: ${input.value.trim() || "uploaded image"}

general {
    col.active_border = ${activeBorderColor1} ${activeBorderColor2} 45deg
}
    `.trim();
}

/**
 * Generates the content for the hyprlock.conf file.
 * @param theme - The Full theme object.
 * @returns A string containing the Hyprlock theme snippet.
 */
function generateHyprlockConfFile(theme: FullTheme): string {
  const backgroundColor = hexToRgba(theme.primary.background, 1.0);
  const innerColor = hexToRgba(theme.primary.background, 0.8);
  const accentColor = hexToRgba(theme.accent || theme.normal.blue, 1.0);
  const foregroundColor = hexToRgba(theme.primary.foreground, 1.0);

  return `
# Hyprlock theme generated by AI Color Palette Generator
# Based on: ${input.value.trim() || "uploaded image"}

$color = ${backgroundColor}
$inner_color = ${innerColor}
$outer_color = ${accentColor}
$font_color = ${foregroundColor}
$check_color = ${accentColor}
    `.trim();
}

/**
 * Generates the content for the mako.ini file.
 * @param theme - The Full theme object.
 * @returns A string containing the mako.ini configuration.
 */
function generateMakoIniFile(theme: FullTheme): string {
  return `
text-color=${theme.primary.foreground}
border-color=${theme.accent || theme.normal.blue}
background-color=${theme.primary.background}
width=420
height=110
padding=10
border-size=2
font=Liberation Sans 11
anchor=top-right
outer-margin=20
default-timeout=5000
max-icon-size=32

[app-name=Spotify]
invisible=1

[mode=do-not-disturb]
invisible=true

[mode=do-not-disturb app-name=notify-send]
invisible=false

[urgency=critical]
default-timeout=0
    `.trim();
}

/**
 * Handles the download of the generated theme files as a zip.
 */
async function handleDownload() {
  if (!currentTheme) {
    showError("No theme available to download.");
    return;
  }

  try {
    const alacrittyContent = generateAlacrittyThemeFile(currentTheme);
    const btopContent = generateBtopThemeFile(currentTheme);
    const chromiumContent = generateChromiumThemeFile(currentTheme);
    const hyprlandContent = generateHyprlandConfFile(currentTheme);
    const hyprlockContent = generateHyprlockConfFile(currentTheme);
    const makoContent = generateMakoIniFile(currentTheme);
    // Use the selected value from the dropdown for the icon theme
    const selectedIconTheme = iconThemeSelect.value;
    const iconsContent = selectedIconTheme;

    const zip = new JSZip();
    zip.file("alacritty.toml", alacrittyContent);
    zip.file("btop.theme", btopContent);
    zip.file("chromium.theme", chromiumContent);
    zip.file("hyprland.conf", hyprlandContent);
    zip.file("hyprlock.conf", hyprlockContent);
    zip.file("mako.ini", makoContent);
    zip.file("icons.theme", iconsContent);

    // Add uploaded image to a 'backgrounds' folder if it exists
    if (uploadedImage) {
      const backgroundsFolder = zip.folder("backgrounds");
      if (backgroundsFolder) {
        backgroundsFolder.file(uploadedImage.name, uploadedImage.data, {
          base64: true,
        });
      }
    }

    const blob = await zip.generateAsync({ type: "blob" });

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ai_terminal_theme.zip";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Error creating zip file:", error);
    showError("Could not create the zip file.");
  }
}

/**
 * Handles the form submission to generate a color palette.
 * @param event - The form submission event.
 */
async function handleGenerate(event: Event) {
  event.preventDefault();
  const userPrompt = input.value.trim();
  const colorMode = (
    document.getElementById("color-mode-select") as HTMLSelectElement
  ).value;
  const modelName = (
    document.getElementById("model-select") as HTMLSelectElement
  ).value;

  if (!userPrompt && !uploadedImage) {
    showError("Please enter a description or upload an image.");
    return;
  }

  setLoading(true);
  paletteContainer.innerHTML = "";
  currentTheme = null;

  try {
    let basePrompt: string;
    if (colorMode === "harmonious") {
      basePrompt = `Your task is to create a sophisticated, harmonious Alacritty terminal color theme. Follow these steps strictly: 1. Identify the single most prominent accent color from the user's input. 2. Provide this single color in the 'accent' field. 3. Generate the ENTIRE theme (primary, normal, and bright colors) using ONLY different shades, tints, and tones of that ONE identified accent color. Do not introduce any other hues. The result must be a cohesive, monochromatic-style palette. The named colors like 'red' or 'green' should just be different shades of the main accent color, not their literal color.`;
    } else {
      // 'vibrant'
      basePrompt = `Generate a complete, aesthetically pleasing, and functional Alacritty terminal color theme. Also, identify the single most prominent accent color from the user's input and provide it in the 'accent' field. The primary background and foreground colors should be directly inspired by the user's input. However, the 8 normal and 8 bright colors (red, green, blue, yellow, etc.) MUST be functionally distinct, vibrant, and have high contrast for excellent code readability and syntax highlighting. These colors should be thematically related to the input but optimized for their purpose in a terminal.`;
    }

    const fullPrompt = userPrompt
      ? `${basePrompt} The theme should be based on: "${userPrompt}".`
      : basePrompt;

    let contents: any;
    if (uploadedImage) {
      const imagePart = {
        inlineData: {
          data: uploadedImage.data,
          mimeType: uploadedImage.mimeType,
        },
      };
      const textPart = { text: fullPrompt };
      contents = { parts: [imagePart, textPart] };
    } else {
      contents = fullPrompt;
    }

    const hexColorSchema = {
      type: Type.STRING,
      description: 'A 6-digit hex color code (e.g., "#RRGGBB").',
    };

    const response = await ai.models.generateContent({
      model: modelName,
      contents: contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            accent: hexColorSchema,
            primary: {
              type: Type.OBJECT,
              properties: {
                background: hexColorSchema,
                foreground: hexColorSchema,
              },
            },
            normal: {
              type: Type.OBJECT,
              properties: {
                black: hexColorSchema,
                red: hexColorSchema,
                green: hexColorSchema,
                yellow: hexColorSchema,
                blue: hexColorSchema,
                magenta: hexColorSchema,
                cyan: hexColorSchema,
                white: hexColorSchema,
              },
            },
            bright: {
              type: Type.OBJECT,
              properties: {
                black: hexColorSchema,
                red: hexColorSchema,
                green: hexColorSchema,
                yellow: hexColorSchema,
                blue: hexColorSchema,
                magenta: hexColorSchema,
                cyan: hexColorSchema,
                white: hexColorSchema,
              },
            },
          },
        },
      },
    });

    if (!response.text) {
      throw new Error("Empty response from AI");
    }
    const jsonResponse = JSON.parse(response.text);
    currentTheme = jsonResponse as FullTheme;
    displayPalette(currentTheme);
    populateIconThemeDropdown(); // Populate dropdown after theme is generated
    if (currentTheme?.accent) {
      const closestYaruColor = getClosestNamedColor(currentTheme.accent);
      iconThemeSelect.value = closestYaruColor; // Pre-select the closest color
    }
  } catch (error) {
    console.error("Error generating palette:", error);
    showError(
      "An error occurred while generating the palette. Please try again."
    );
  } finally {
    setLoading(false);
  }
}

/**
 * Main function to initialize the app.
 */
function main() {
  if (form) {
    form.addEventListener("submit", handleGenerate);
    imageUploadInput.addEventListener("change", handleImageUpload);
    removeImageButton.addEventListener("click", clearImage);
    downloadButton.addEventListener("click", handleDownload);
  } else {
    console.error("Form element not found!");
  }
}

main();
