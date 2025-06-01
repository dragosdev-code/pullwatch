export const Footer = () => {
  return (
    <div className="px-5 py-3 border-t border-gray-100 bg-gray-50">
      <a
        href="https://github.com/pulls?q=is%3Apr+is%3Aopen+user-review-requested%3A%40me"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-600 hover:text-blue-700 hover:underline transition-colors duration-200 font-medium"
      >
        View all on GitHub →
      </a>
    </div>
  );
};
