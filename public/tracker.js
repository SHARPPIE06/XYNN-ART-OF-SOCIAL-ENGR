import { createClient } from 'https://esm.sh/@supabase/supabase-js'

class VisitorTracker {
    constructor() {
        // Initialize Supabase with environment variables
        this.supabase = createClient(
            'https://miygojwoyvvwdjkjugif.supabase.co',
            'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1peWdvandveXZ2d2Rqa2p1Z2lmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MzI5NDEzMDQsImV4cCI6MjA0ODUxNzMwNH0.bjyOiSDwvTRFaBrWTGGEl4u_G2DetVnV1vE6DDmPK4E'
        );
        this.map = null; // Will be set by the map initialization in index.html
    }

    async trackVisitor() {
        try {
            let position;
            try {
                // Try getting visitor's location
                position = await this.getCurrentPosition();
            } catch (geoError) {
                console.warn('Geolocation failed:', geoError);
                // Fallback to IP-based location
                const ipInfo = await this.getVisitorInfo();
                position = {
                    coords: {
                        latitude: parseFloat(ipInfo.latitude) || 0,
                        longitude: parseFloat(ipInfo.longitude) || 0
                    }
                };
            }

            const ipInfo = await this.getVisitorInfo();
            
            // Get device info
            const deviceInfo = {
                os: navigator.platform,
                browser: navigator.userAgent,
                deviceType: /Mobile|Android|iPhone/i.test(navigator.userAgent) ? 'Mobile' : 'Desktop',
                screen: `${window.screen.width}x${window.screen.height}`
            };
            
            // Add marker to map
            this.addMarker(position.coords.latitude, position.coords.longitude);
            
            // Save to database
            await this.saveVisitorData({
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                ip_address: ipInfo.ip,
                os: deviceInfo.os,
                browser: deviceInfo.browser,
                device_type: deviceInfo.deviceType,
                screen_resolution: deviceInfo.screen,
                country: ipInfo.country_name || 'Unknown',
                isp: ipInfo.org || 'Unknown',
                visit_time: new Date().toISOString()
            });
        } catch (error) {
            console.error('Error tracking visitor:', error);
        }
    }

    getCurrentPosition() {
        return new Promise((resolve, reject) => {
            // Check if we're in a secure context
            if (!window.isSecureContext) {
                console.error('Geolocation requires a secure context (HTTPS)');
                reject(new Error('Geolocation requires HTTPS'));
                return;
            }

            if (!navigator.geolocation) {
                reject(new Error('Geolocation is not supported'));
                return;
            }

            const options = {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            };

            navigator.geolocation.getCurrentPosition(resolve, reject, options);
        });
    }

    async getVisitorInfo() {
        try {
            // Use a more reliable IP API service
            const response = await fetch('https://ipapi.co/json/');
            const data = await response.json();
            return {
                ip: data.ip,
                country_name: data.country_name,
                org: data.org,
                latitude: data.latitude,
                longitude: data.longitude
            };
        } catch (error) {
            console.error('Error getting IP info:', error);
            return {
                ip: 'unknown',
                country_name: 'Unknown',
                org: 'Unknown',
                latitude: 0,
                longitude: 0
            };
        }
    }

    addMarker(lat, lng) {
        try {
            const customIcon = L.divIcon({
                html: `<div style="
                    background-color: #00ff00;
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    border: 2px solid #ffffff;
                    box-shadow: 0 0 10px rgba(0,255,0,0.5);
                "></div>`,
                className: 'custom-marker',
                iconSize: [12, 12],
                iconAnchor: [6, 6]
            });

            L.marker([lat, lng], { icon: customIcon }).addTo(this.map)
                .bindPopup(`
                    <div style="color: #00ff00; background: #000; padding: 5px;">
                        <strong>Location:</strong> ${lat}, ${lng}
                    </div>
                `)
                .openPopup();
        } catch (error) {
            console.error('Error adding marker:', error);
        }
    }

    async saveVisitorData(visitorData) {
        try {
            // First, check for existing entries with same IP or coordinates
            const { data: existingVisitors, error: queryError } = await this.supabase
                .from('visitors')
                .select('*')
                .or(`ip_address.eq.${visitorData.ip_address},and(latitude.eq.${visitorData.latitude},longitude.eq.${visitorData.longitude})`);

            if (queryError) throw queryError;

            // If no existing entries found, save the new visitor
            if (!existingVisitors || existingVisitors.length === 0) {
                const { data, error } = await this.supabase
                    .from('visitors')
                    .insert([visitorData]);

                if (error) throw error;
                console.log('New visitor data saved:', data);
                
                // Refresh the table after saving
                await this.fetchVisitors();
                
                return data;
            } else {
                console.log('Visitor already exists with same IP or coordinates');
                // Still refresh the table to show existing data
                await this.fetchVisitors();
                return null;
            }
        } catch (error) {
            console.error('Error saving visitor data:', error);
        }
    }

    async fetchVisitors() {
        try {
            const { data, error } = await this.supabase
                .from('visitors')
                .select('*')
                .order('visit_time', { ascending: false });

            if (error) throw error;

            const visitorTableBody = document.getElementById('visitor-data');
            visitorTableBody.innerHTML = '';

            data.forEach(visitor => {
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${visitor.latitude}</td>
                    <td>${visitor.longitude}</td>
                    <td>${visitor.ip_address}</td>
                    <td>${visitor.os}</td>
                    <td>${visitor.browser.substring(0, 50)}...</td>
                    <td>${visitor.device_type}</td>
                    <td>${visitor.screen_resolution}</td>
                    <td>${visitor.country}</td>
                    <td>${visitor.isp}</td>
                    <td>${new Date(visitor.visit_time).toLocaleString()}</td>
                    <td><button class="map-mode-button preview-button">PREVIEW</button></td>
                    <td><button class="map-mode-button street-view-button">STREET VIEW</button></td>
                    <td><button class="map-mode-button zoom-button">ZOOM</button></td>
                `;
                visitorTableBody.appendChild(row);
            });
        } catch (error) {
            console.error('Error fetching visitors:', error);
        }
    }
}

// Export the class for use in index.html
export default VisitorTracker; 