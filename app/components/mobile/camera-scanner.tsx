
'use client';

import { useState, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Camera, Upload, X, RotateCcw, Check, FileImage } from 'lucide-react';
import Image from 'next/image';

interface CameraScannerProps {
  onImageCapture: (imageData: string, file: File) => void;
  onImageUpload?: (file: File) => void;
  title?: string;
  description?: string;
  acceptedTypes?: string;
}

export default function CameraScanner({
  onImageCapture,
  onImageUpload,
  title = "Document Scanner",
  description = "Capture or upload document images",
  acceptedTypes = "image/*"
}: CameraScannerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = useCallback(async () => {
    try {
      setError(null);
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment', // Back camera preferred
          width: { ideal: 1920 },
          height: { ideal: 1080 }
        }
      });
      
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      setError('Unable to access camera. Please check permissions.');
    }
  }, []);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  const captureImage = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;

    setIsCapturing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');

    if (!context) return;

    // Set canvas dimensions to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw the video frame to canvas
    context.drawImage(video, 0, 0);

    // Convert to blob and create data URL
    canvas.toBlob((blob) => {
      if (blob) {
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          setCapturedImage(dataUrl);
          
          // Create a File object from the blob
          const file = new File([blob], `capture-${Date.now()}.jpg`, { type: 'image/jpeg' });
          onImageCapture(dataUrl, file);
          
          setIsCapturing(false);
          stopCamera();
        };
        reader.readAsDataURL(blob);
      }
    }, 'image/jpeg', 0.9);
  }, [onImageCapture, stopCamera]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        setCapturedImage(dataUrl);
        onImageCapture(dataUrl, file);
        
        if (onImageUpload) {
          onImageUpload(file);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setError(null);
    startCamera();
  };

  const handleAccept = () => {
    setIsOpen(false);
    setCapturedImage(null);
    setError(null);
  };

  const handleClose = () => {
    setIsOpen(false);
    stopCamera();
    setCapturedImage(null);
    setError(null);
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      setIsOpen(open);
      if (!open) {
        handleClose();
      }
    }}>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full sm:w-auto">
          <Camera className="h-4 w-4 mr-2" />
          Scan Document
        </Button>
      </DialogTrigger>
      
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center">
            <Camera className="h-5 w-5 mr-2" />
            {title}
          </DialogTitle>
          <DialogDescription>
            {description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          {!stream && !capturedImage && !error && (
            <div className="text-center space-y-4">
              <div className="p-8 border-2 border-dashed border-gray-300 rounded-lg">
                <Camera className="h-12 w-12 mx-auto text-gray-400 mb-4" />
                <p className="text-sm text-gray-600 mb-4">
                  Capture a document using your camera or upload from gallery
                </p>
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button onClick={startCamera} className="flex-1">
                    <Camera className="h-4 w-4 mr-2" />
                    Open Camera
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex-1"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Upload
                  </Button>
                </div>
              </div>
              
              <input
                ref={fileInputRef}
                type="file"
                accept={acceptedTypes}
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
          )}

          {stream && !capturedImage && (
            <div className="space-y-4">
              <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />
                <canvas
                  ref={canvasRef}
                  className="hidden"
                />
              </div>
              
              <div className="flex justify-center space-x-2">
                <Button
                  onClick={captureImage}
                  disabled={isCapturing}
                  size="lg"
                  className="px-8"
                >
                  {isCapturing ? (
                    <>
                      <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full mr-2" />
                      Capturing...
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4 mr-2" />
                      Capture
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={stopCamera}>
                  <X className="h-4 w-4 mr-2" />
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {capturedImage && (
            <div className="space-y-4">
              <div className="relative aspect-video bg-gray-100 rounded-lg overflow-hidden">
                <Image
                  src={capturedImage}
                  alt="Captured document"
                  fill
                  className="object-contain"
                />
              </div>
              
              <div className="flex justify-center space-x-2">
                <Button onClick={handleAccept} className="flex-1">
                  <Check className="h-4 w-4 mr-2" />
                  Accept
                </Button>
                <Button variant="outline" onClick={handleRetake} className="flex-1">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  Retake
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
