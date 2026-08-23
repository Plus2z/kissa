---
name: Unified Social Core
colors:
  surface: '#faf9f9'
  surface-dim: '#dbdad9'
  surface-bright: '#faf9f9'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f5f3f3'
  surface-container: '#efeded'
  surface-container-high: '#e9e8e8'
  surface-container-highest: '#e3e2e2'
  on-surface: '#1b1c1c'
  on-surface-variant: '#3d4a3d'
  inverse-surface: '#303031'
  inverse-on-surface: '#f2f0f0'
  outline: '#6c7b6c'
  outline-variant: '#bbcbba'
  surface-tint: '#006d33'
  primary: '#006d33'
  on-primary: '#ffffff'
  primary-container: '#07c160'
  on-primary-container: '#00471f'
  inverse-primary: '#45e17c'
  secondary: '#5d5f5f'
  on-secondary: '#ffffff'
  secondary-container: '#dcdddd'
  on-secondary-container: '#5f6161'
  tertiary: '#5f5e5e'
  on-tertiary: '#ffffff'
  tertiary-container: '#a9a7a7'
  on-tertiary-container: '#3d3d3c'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#66ff95'
  primary-fixed-dim: '#45e17c'
  on-primary-fixed: '#00210b'
  on-primary-fixed-variant: '#005225'
  secondary-fixed: '#e2e2e2'
  secondary-fixed-dim: '#c6c6c7'
  on-secondary-fixed: '#1a1c1c'
  on-secondary-fixed-variant: '#454747'
  tertiary-fixed: '#e5e2e1'
  tertiary-fixed-dim: '#c8c6c5'
  on-tertiary-fixed: '#1c1b1b'
  on-tertiary-fixed-variant: '#474746'
  background: '#faf9f9'
  on-background: '#1b1c1c'
  surface-variant: '#e3e2e2'
typography:
  display-lg:
    fontFamily: Inter
    fontSize: 22px
    fontWeight: '600'
    lineHeight: 28px
  headline-md:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Inter
    fontSize: 17px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 20px
  label-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0.2px
  display-lg-mobile:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 26px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  unit: 4px
  margin-page: 16px
  gutter-list: 12px
  padding-card: 16px
  stack-sm: 8px
  stack-md: 16px
---

## Brand & Style
The design system is built upon the principles of **Utility Minimalism**. It prioritizes high-frequency communication and utility over decorative flourish. The target audience encompasses a universal demographic, requiring an interface that feels invisible yet dependable.

The aesthetic follows a **Modern Corporate** approach, characterized by a restrained color palette, generous whitespace, and a clear information hierarchy. The goal is to evoke a sense of "digital calm" and "immediate familiarity," ensuring that the interface never distracts from the content—whether that be personal messages, financial transactions, or social feeds.

## Colors
The palette is dominated by **Primary Green**, used strategically for high-priority actions and active states. 

- **Primary (#07C160):** Used for "Send" buttons, active toggle states, and primary navigation icons.
- **Surface (#F7F7F7):** The global background color, providing a soft contrast against pure white containers.
- **Content Primary (#191919):** Applied to all body text and headers to ensure maximum legibility.
- **Content Secondary (#808080):** Used for timestamps, descriptions, and placeholder text.
- **Border (#E6E6E6):** A subtle hairline stroke used to define boundaries without adding visual weight.

## Typography
The system utilizes **Inter** as a highly legible substitute for system-native sans-serifs, maintaining a functional and neutral tone. 

The type scale is intentionally tight. The primary reading size is set at **17px** to accommodate diverse age groups and maximize readability in chat-heavy contexts. Weight is used sparingly; "Medium" or "Semi-bold" (600) is reserved for headers and button labels, while "Regular" (400) handles all conversational and descriptive content.

## Layout & Spacing
This design system employs a **Fixed Content Model** for mobile-first environments. 

- **Grid:** A standard 4px baseline grid governs all vertical rhythm.
- **Margins:** Universal page margins are set to **16px**.
- **Lists:** Content is primarily organized in vertical stacks (List Views). Elements within a list item are separated by a **12px** gutter.
- **Adaptivity:** On larger screens, the content container is capped at 600px and centered, maintaining the mobile-optimized vertical flow to preserve the "familiar" chat interface.

## Elevation & Depth
Depth is created through **Tonal Layering** rather than shadows. 

The primary canvas is `#F7F7F7`. Interactive elements, such as chat bubbles or list items, sit on a white (`#FFFFFF`) surface. 
- **Separation:** Use `#E6E6E6` hairline borders (0.5pt to 1pt) to separate list items. 
- **Active State:** Tapping an element should trigger a subtle grey overlay (`rgba(0,0,0,0.05)`) to provide tactile feedback without simulating physical height. 
- **Floating Elements:** Only high-level modals or action sheets may use a soft, large-radius ambient shadow to indicate they are positioned above the main application flow.

## Shapes
The shape language is **Soft-Geometric**. 

Standard containers, such as input fields and card-style modules, utilize a **8px (0.5rem)** radius. Chat bubbles feature a slightly higher roundedness to feel more organic. Interactive buttons use the `rounded-lg` token (16px) to create a approachable, friendly appearance that invites touch.

## Components

### Buttons
- **Primary:** Solid `#07C160` background with white text. No shadow. 16px corner radius.
- **Secondary:** White background with `#191919` text and a `#E6E6E6` border.

### Chat Bubbles
- **Sender:** Primary Green background, white text.
- **Receiver:** White background, Content Primary text. 
- Both use 8px rounding, with a small "tail" or directional corner to indicate the speaker.

### Input Fields
- Flat styling with a white background.
- Top and bottom boundaries are defined by a `#E6E6E6` hairline border rather than a fully enclosed box.

### Lists & Cells
- 56px minimum height for touch targets.
- Icons should be 24px-28px in size.
- A full-width `#E6E6E6` divider should separate items, inset by 16px from the left to align with text.

### Navigation Bar
- Semi-transparent white background with a heavy backdrop blur.
- Center-aligned titles using `headline-md`.
- Simple icon-based tab bar at the bottom with Primary Green for the active state.