# Veashi - Cross-Chain Message Explorer

A distinctive, production-grade cross-chain message explorer for the Hashi protocol. Track messages across multiple bridge providers including CCIP, LayerZero, Vea, and DeBridge with a bold, Kleros-inspired interface.

## Features

- **Message List Page**: Browse all cross-chain messages with pagination (7-8 messages per page)
- **Transaction Details Page**: Deep dive into individual transactions with full bridge and address information
- **Multi-Bridge Support**: Track messages across CCIP, LayerZero, Vea, and DeBridge
- **Threshold Status**: Visual progress indicators showing threshold completion (e.g., 2/3)
- **Block Range Display**: See the block range being scanned
- **Responsive Design**: Beautiful on all screen sizes
- **Smooth Animations**: Staggered fade-ins, hover effects, and glowing status indicators
- **Copy-to-Clipboard**: Easy copying of transaction hashes and addresses

## Design System

### Color Palette

- **Deep Purple**: `#6b46c1` - Primary brand color
- **Electric Pink**: `#ec4899` - Accent and CTAs
- **Dark Background**: `#0a0414` - Main background with gradient mesh
- **Surface**: `#140d24` - Card backgrounds with glass morphism

### Typography

- **UI Font**: DM Sans - Clean, modern sans-serif
- **Mono Font**: JetBrains Mono - For addresses and hashes

### Components

- **ChainBadge**: Colored badges for different chains (Ethereum, Arbitrum, etc.)
- **BridgeBadge**: Styled badges for bridge providers
- **StatusIndicator**: Circular progress indicator with color-coded status
- **CopyButton**: Interactive button with copy feedback
- **Pagination**: Elegant page navigation

## Tech Stack

- **Next.js 16** - React framework with App Router
- **TypeScript** - Type-safe development
- **Tailwind CSS 4** - Utility-first styling
- **React 19** - Latest React features

## Getting Started

```bash
# Install dependencies
yarn install

# Run development server
yarn dev

# Build for production
yarn build

# Start production server
yarn start
```

Open [http://localhost:3000](http://localhost:3000) to see the application.

## Project Structure

```
veashi-scanner/
├── app/
│   ├── layout.tsx          # Root layout with gradient mesh background
│   ├── page.tsx            # Home page with message list
│   ├── tx/[hash]/
│   │   └── page.tsx        # Transaction detail page
│   └── globals.css         # Global styles and design system
├── components/
│   ├── Header.tsx          # Main navigation header
│   ├── ChainBadge.tsx      # Chain identifier badges
│   ├── BridgeBadge.tsx     # Bridge provider badges
│   ├── StatusIndicator.tsx # Threshold progress indicator
│   ├── CopyButton.tsx      # Copy-to-clipboard button
│   └── Pagination.tsx      # Page navigation
├── lib/
│   ├── types.ts            # TypeScript type definitions
│   └── mock-data.ts        # Mock data for development
└── next.config.ts          # Next.js configuration
```

## Pages

### Home Page (`/`)

- Lists all cross-chain messages
- Shows source/destination chains
- Displays transaction hash (clickable)
- Shows threshold status (e.g., 2/3)
- Pagination controls
- Block range information
- Stats cards (Total, Completed, In Progress)

### Transaction Detail Page (`/tx/[hash]`)

- Large status indicator with threshold progress
- Source and destination chain information
- All active bridges for the transaction
- Source and destination addresses (with copy functionality)
- Block number, threshold required, timestamp
- Back navigation to message list

## Mock Data

The application currently uses mock data defined in `lib/mock-data.ts`. Replace this with actual API calls to your backend or blockchain data source.

## Customization

### Adding New Chains

Edit `lib/types.ts` and `components/ChainBadge.tsx` to add new chain definitions and colors.

### Adding New Bridges

Edit `lib/types.ts` and `components/BridgeBadge.tsx` to add new bridge providers.

### Styling

All design tokens are defined in `app/globals.css` under CSS custom properties for easy theming.

## Deployment

The easiest way to deploy is using [Vercel](https://vercel.com):

```bash
vercel
```

Or build and deploy to any Node.js hosting platform:

```bash
yarn build
yarn start
```

## License

MIT

## Credits

Inspired by [Kleros](https://kleros.io) design language.
Built with [Claude Code](https://claude.com/claude-code).
