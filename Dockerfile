FROM nginx:alpine

# Copy static assets to nginx html folder
COPY . /usr/share/nginx/html

# Expose standard web port
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
