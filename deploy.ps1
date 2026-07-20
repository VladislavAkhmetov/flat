# deploy.ps1 - MVP Deployment Script for Yandex Cloud

$BUCKET_NAME = "flat-widget-assets"
$FUNC_NAME = "flat-api"
$REGION = "ru-central1"

Write-Host "Building Frontend..."
npm run build -w apps/widget-frontend

Write-Host "Uploading Frontend to Object Storage..."
# Requires YC CLI configured
# yc storage s3 cp --recursive apps/widget-frontend/dist s3://$BUCKET_NAME/

Write-Host "Building Backend..."
npm run build -w apps/api-backend

Write-Host "Deploying Backend Cloud Function..."
# yc serverless function version create \
#   --function-name=$FUNC_NAME \
#   --runtime nodejs18 \
#   --entrypoint dist/app.start \
#   --memory 256m \
#   --execution-timeout 5s \
#   --source-path apps/api-backend \
#   --environment DATABASE_URL=$env:DATABASE_URL

Write-Host "Deployment Complete (Dry Run)"
