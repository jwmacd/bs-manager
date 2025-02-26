import React from 'react';

export interface FileSizeTextProps {
    fileSize: number; // File size in bytes
    className?: string;
}

export const FileSizeText: React.FC<FileSizeTextProps> = ({ fileSize, className }) => {
    const formatFileSize = (sizeInBytes: number): string => {
        if (sizeInBytes === 0) return '0 B';
        
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(sizeInBytes) / Math.log(1024));
        
        // Format with one decimal place for MB and greater, no decimals for KB and B
        const size = sizeInBytes / Math.pow(1024, i);
        const formattedSize = i >= 2 ? size.toFixed(1) : Math.round(size).toString();
        
        return `${formattedSize} ${units[i]}`;
    };

    return (
        <span className={className}>
            {formatFileSize(fileSize)}
        </span>
    );
};