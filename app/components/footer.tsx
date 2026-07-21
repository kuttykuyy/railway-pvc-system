
'use client';

import Link from 'next/link';
import { Building2, Mail, Phone, Globe } from 'lucide-react';

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white mt-auto">
      <div className="container mx-auto px-4 py-12 max-w-7xl">
        {/* Main Footer Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
          {/* Company Info */}
          <div>
            <div className="flex items-center space-x-3 mb-4">
              <div className="bg-gradient-to-r from-emerald-500 to-emerald-600 p-3 rounded-lg">
                <Building2 className="h-6 w-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">IR-PVC</h3>
              </div>
            </div>
            <p className="text-gray-300 leading-relaxed text-sm">
              Automated PVC calculations and contract management system for Indian Railway contractors.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-white">Quick Links</h4>
            <ul className="space-y-2 text-sm">
              <li>
                <Link href="/about" className="text-gray-300 hover:text-emerald-400 transition-colors">
                  About Us
                </Link>
              </li>
              <li>
                <Link href="/pricing" className="text-gray-300 hover:text-emerald-400 transition-colors">
                  Pricing
                </Link>
              </li>
              <li>
                <Link href="/contact" className="text-gray-300 hover:text-emerald-400 transition-colors">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/help" className="text-gray-300 hover:text-emerald-400 transition-colors">
                  Help & Support
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact Info */}
          <div>
            <h4 className="text-lg font-semibold mb-4 text-white">Contact Us</h4>
            <ul className="space-y-3 text-sm">
              <li className="flex items-start space-x-2">
                <Mail className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <a 
                  href="mailto:admin@illall.in" 
                  className="text-gray-300 hover:text-emerald-400 transition-colors break-all"
                >
                  admin@illall.in
                </a>
              </li>
              <li className="flex items-start space-x-2">
                <Phone className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <a 
                  href="tel:+919944776689" 
                  className="text-gray-300 hover:text-emerald-400 transition-colors"
                >
                  +91 9944776689
                </a>
              </li>
              <li className="flex items-start space-x-2">
                <Globe className="h-4 w-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                <a 
                  href="https://irpvc.in" 
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-gray-300 hover:text-emerald-400 transition-colors"
                >
                  irpvc.in
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-700 pt-6">
          <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
            {/* Copyright */}
            <div className="text-sm text-gray-400 text-center md:text-left">
              <p>
                © {currentYear} <span className="font-semibold text-white">IR-PVC</span>. All rights reserved.
              </p>
              <p className="text-xs mt-1">
                Indian Railway Price Variation Clause Calculator
              </p>
            </div>

            {/* Legal Links */}
            <div className="flex space-x-6 text-sm">
              <Link 
                href="/privacy" 
                className="text-gray-400 hover:text-emerald-400 transition-colors"
              >
                Privacy Policy
              </Link>
              <Link 
                href="/terms" 
                className="text-gray-400 hover:text-emerald-400 transition-colors"
              >
                Terms of Service
              </Link>
              <Link 
                href="/refund" 
                className="text-gray-400 hover:text-emerald-400 transition-colors"
              >
                Refund Policy
              </Link>
            </div>
          </div>
        </div>

      </div>
    </footer>
  );
}