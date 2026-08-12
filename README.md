# Nexora Premier

Create a modern, premium-quality, responsive web application called Nexora, a complete Tourism Business Marketplace Platform where tourists can discover, plan, and book Travel & Tour packages, Accommodations, and Restaurants from one centralized platform. The application should have an elegant, luxurious, and highly interactive user interface similar to Airbnb, Booking.com, Klook, and TripAdvisor while maintaining a unique identity. The overall design should use smooth animations, glassmorphism effects, soft shadows, rounded cards, beautiful gradients, attractive iconography, animated statistics, interactive maps, loading skeletons, hover effects, parallax hero sections, and professional typography. The website should feel premium, fast, mobile-first, and polished enough for commercial production.

Use React, TypeScript, Vite, Tailwind CSS, Shadcn UI components, React Router, React Query, Framer Motion for animations, Lucide Icons, React Hook Form, Zod validation, and Supabase as the backend. Organize the project into reusable components with proper folder structure, custom hooks, services, utilities, layouts, and pages. Follow clean architecture principles so the project is easy to maintain and scale. The application should be optimized for performance, accessibility, SEO, and Cloudflare deployment. Ensure that the project builds successfully without errors or warnings.

Connect the application to the existing Supabase project.

Supabase URL:
https://aeynekfhnzjcimskwouw.supabase.co

Configure the project using environment variables so credentials are never hardcoded. Create an API layer for all Supabase operations. Every create, update, delete, and read operation must synchronize with Supabase in real time whenever possible. Handle authentication securely using Supabase Auth. Store user profiles in a profiles table and associate all records with authenticated users. Use Row Level Security and policies that restrict users to their own records while allowing administrators complete access. Every database operation should include loading indicators, optimistic UI updates where appropriate, and graceful error handling with toast notifications.

The application must support four user roles: Visitor, Tourist, Business Owner, and Administrator. Visitors may browse public listings but cannot make bookings. Tourists can register, log in, create profiles, book tours, reserve accommodations, reserve restaurant tables, manage favorites, view booking history, submit reviews, upload travel photos, and receive notifications. Business Owners can register their businesses, submit verification documents, upload images, create listings, manage bookings, respond to customer inquiries, monitor sales analytics, edit business information, and receive notifications. Administrators can approve or reject businesses, manage users, moderate reviews, oversee bookings, publish announcements, monitor analytics, generate reports, and configure platform settings.

Create a beautiful landing page with a full-screen hero banner containing animated backgrounds, featured destinations, a global search bar, call-to-action buttons, featured categories, promotional banners, customer testimonials, trending destinations, recently added businesses, travel statistics, and a footer with contact information, social media links, policies, FAQs, and newsletter subscription.

Implement a universal search system capable of searching Travel Packages, Hotels, Resorts, Restaurants, Destinations, Cities, and Attractions simultaneously. Include advanced filters such as price range, ratings, category, business type, destination, duration, amenities, available dates, family friendly, adventure, beach, mountain, food, luxury, budget, and popularity.

The Travel & Tour module should allow verified business owners to upload tour packages with package name, description, destination, duration, itinerary, inclusions, exclusions, available schedules, meeting location, pickup points, pricing, promotional discounts, image gallery, featured image, promotional videos, remaining seat availability, cancellation policy, and frequently asked questions. Customers should be able to browse interactive package cards, view image galleries, see itinerary timelines, availability calendars, remaining seats, reviews, maps, weather information, related destinations, and complete bookings online. After booking, generate a digital booking confirmation with QR Code, booking number, payment status, downloadable receipt, and trip countdown.

The Accommodation module should allow hotels, resorts, hostels, apartments, and homestays to upload complete property information including room types, capacities, prices, amenities, policies, check-in and check-out times, image galleries, availability calendars, featured rooms, and promotional offers. Customers should be able to compare accommodations, browse room galleries, filter by amenities, reserve rooms, manage reservations, cancel bookings according to policies, leave reviews after completed stays, and save favorite accommodations.

The Restaurant module should allow restaurant owners to upload digital menus with categories, food photos, descriptions, pricing, availability status, best-selling items, promotional discounts, business hours, reservation capacity, and contact information. Customers should browse food galleries, search menu items, reserve dining tables, favorite restaurants, leave ratings and reviews, and view business locations using interactive maps.

Create a Smart Trip Planner where users can enter their travel destination, travel dates, number of travelers, interests, and budget. The application should automatically recommend the most suitable combination of tour packages, accommodations, and restaurants while calculating estimated costs. Users should be able to customize the generated itinerary before confirming reservations.

Create a complete booking management system where users can manage all bookings from one dashboard. Every booking should have statuses such as Pending, Approved, Confirmed, Completed, Cancelled, and Rejected. Business owners should receive notifications whenever new bookings are submitted, and customers should receive notifications whenever booking statuses change.

Implement a review and rating system allowing users to submit ratings, comments, and photo uploads after completed bookings. Display average ratings, review summaries, and recent customer experiences on business pages.

Create a notification center supporting booking updates, approval notifications, promotional campaigns, announcements, reminders, payment confirmations, and travel countdown alerts.

Provide dashboards with visually appealing charts, summary cards, booking trends, monthly income, popular destinations, most booked accommodations, top-rated restaurants, visitor statistics, pending approvals, active users, and recent activities. Use responsive charts and attractive data visualization components.

Create a secure administrator dashboard where administrators can approve new business registrations before they become publicly visible. Businesses remain hidden until approved. Administrators should be able to suspend businesses, delete inappropriate content, moderate reviews, manage announcements, export reports, and oversee platform activity.

Every uploaded image should be stored in Supabase Storage with organized folders such as travel-packages, accommodations, restaurants, business-logos, user-avatars, review-images, and gallery-images. Automatically compress images before upload when appropriate and display upload progress indicators.

Implement a responsive navigation bar that changes appearance while scrolling, supports dark mode and light mode, includes user profile menus, notification badges, and smooth page transitions. Use modern loading animations, skeleton screens, empty states, confirmation dialogs, success animations, and elegant toast notifications throughout the application.

Use reusable components, reusable dialogs, reusable forms, reusable data tables, reusable cards, reusable statistics widgets, reusable modals, reusable confirmation popups, and reusable pagination components. Ensure all forms are validated using Zod with friendly validation messages.

Design every page to be fully responsive for desktop, tablet, and mobile devices. Optimize layouts for different screen sizes without horizontal scrolling. Use lazy loading, code splitting, optimized images, and efficient state management for excellent performance.

Prepare the application for deployment on Cloudflare. Configure environment variables for Supabase credentials, ensure all routing supports Cloudflare Pages, avoid server-side dependencies incompatible with Cloudflare Workers, and provide production-ready build settings. The project should build successfully using npm install followed by npm run build without any TypeScript or ESLint errors. Include a README explaining local development, environment configuration, Supabase setup, Cloudflare deployment, database migrations, authentication, storage configuration, and production deployment steps.

Finally, generate the required Supabase SQL schema, including tables, relationships, indexes, Row Level Security policies, storage bucket recommendations, and seed data for testing. The generated application should be visually stunning, production-ready, secure, scalable, maintainable, and immediately deployable with Supabase and Cloudflare after supplying the required environment variables.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://trip-trilogy.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/6eaa0d01-afba-4e60-9493-955f3cce5805).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
