FROM node:22-alpine
WORKDIR /app
COPY index.mjs ./
ENV PORT=8080 DATA_FILE=/data/scores.json
VOLUME /data
EXPOSE 8080
CMD ["node", "index.mjs"]
