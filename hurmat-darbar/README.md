# Hurmat Darbar Customer Website

Static customer-facing website. Deployable with GitHub Pages from the repository subfolder using a Pages workflow or a separate deployment configuration.

## Current scope
- Responsive restaurant landing page
- Contact, opening hours and directions
- Menu category navigation shell
- No invented menu items or prices; the supplied PDF could not be reliably text-extracted, so menu entries require visual transcription and owner verification.

## Not yet connected
Ordering, customer OTP login, reservations, payment processing, admin tools and rider tracking require a secure backend and provider configuration. Do not treat the current static site as a live ordering system.

## Deployment
Publish this folder as the Pages site root using GitHub Actions, or deploy this folder as the project root on a static hosting provider.